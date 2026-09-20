/* SPDX-License-Identifier: MIT
 * Root-only syscall backend; invoke through bind-boundary.mjs, not directly.
 * Input is a bounded binary policy, with no executable/path fields.
 */
#include "bind-boundary-core.h"
#include <sys/vfs.h>
#include <linux/magic.h>

#define PIN_DIR "/sys/fs/bpf/developed_bind_boundary"
#define CGROUP_ROOT "/sys/fs/cgroup"
struct wire_header { uint32_t version,count; };
struct wire_entry { uint32_t uid,udp_zero,ports[MAX_PORTS]; };
static void require(int condition,const char *message) {
  if(!condition) { fprintf(stderr,"%s\n",message); exit(1); }
}
static uint32_t info_id(int fd,void *info,size_t size) {
  union bpf_attr a={0}; a.info.bpf_fd=fd; a.info.info_len=size; a.info.info=(uintptr_t)info;
  if(bpf(BPF_OBJ_GET_INFO_BY_FD,&a)) fatal("BPF object info");
  /* Every supported info structure begins with type then ID. */
  return ((uint32_t*)info)[1];
}
static int object(const char *name,int fd) {
  char path[200]; snprintf(path,sizeof(path),"%s/%s",PIN_DIR,name);
  union bpf_attr a={0}; a.pathname=(uintptr_t)path;
  if(fd>=0) { a.bpf_fd=fd; return bpf(BPF_OBJ_PIN,&a); }
  return bpf(BPF_OBJ_GET,&a);
}
static void trusted_dir(const char *path) {
  struct stat s;
  require(!lstat(path,&s)&&S_ISDIR(s.st_mode)&&s.st_uid==0&&!(s.st_mode&0022),"Untrusted BPF/cgroup directory");
}
static void verify_attachment(int cg,int prog,enum bpf_attach_type type,int map) {
  struct bpf_map_info mi={0}; uint32_t map_id=info_id(map,&mi,sizeof(mi));
  require(mi.type==BPF_MAP_TYPE_ARRAY_OF_MAPS&&mi.max_entries==1&&mi.key_size==4&&mi.value_size==4,"Unexpected outer map");
  uint32_t maps[4]={0}; struct bpf_prog_info pi={.nr_map_ids=ARRAY_SIZE(maps),.map_ids=(uintptr_t)maps};
  uint32_t id=info_id(prog,&pi,sizeof(pi));
  require(pi.type==BPF_PROG_TYPE_CGROUP_SOCK_ADDR&&pi.nr_map_ids==1&&maps[0]==map_id,"Pinned program does not use policy map");
  require(!strcmp(pi.name,type==BPF_CGROUP_INET4_BIND?"dev_bind4_v1":"dev_bind6_v1"),"Unexpected pinned program version");
  uint32_t ids[64]={0}; union bpf_attr a={0}; a.query.target_fd=cg;
  a.query.attach_type=type; a.query.prog_cnt=ARRAY_SIZE(ids); a.query.prog_ids=(uintptr_t)ids;
  if(bpf(BPF_PROG_QUERY,&a)) fatal("query exact root cgroup attachment");
  int found=0; for(unsigned int i=0;i<a.query.prog_cnt;i++) if(ids[i]==id) found=1;
  require(found,"Pinned guard is not attached to root cgroup");
  require(a.query.attach_flags&BPF_F_ALLOW_MULTI,"Guard attachment does not preserve multi-program semantics");
}
static void prevent_uid_removal(int outer,int new_inner) {
  uint32_t zero=0,id=0; union bpf_attr a={0}; a.map_fd=outer;
  a.key=(uintptr_t)&zero; a.value=(uintptr_t)&id;
  if(bpf(BPF_MAP_LOOKUP_ELEM,&a)) fatal("lookup active policy");
  memset(&a,0,sizeof(a)); a.map_id=id;
  int old=bpf(BPF_MAP_GET_FD_BY_ID,&a); if(old<0) fatal("open active policy");
  uint32_t current=0,next=0; int first=1;
  for(;;) {
    memset(&a,0,sizeof(a)); a.map_fd=old; a.key=first?0:(uintptr_t)&current; a.next_key=(uintptr_t)&next;
    if(bpf(BPF_MAP_GET_NEXT_KEY,&a)) { require(errno==ENOENT,"Cannot enumerate active policy"); break; }
    struct policy policy;
    memset(&a,0,sizeof(a)); a.map_fd=new_inner; a.key=(uintptr_t)&next; a.value=(uintptr_t)&policy;
    require(!bpf(BPF_MAP_LOOKUP_ELEM,&a),"Refusing to remove a protected UID; retain entry with empty ports");
    current=next; first=0;
  }
  close(old);
}
int main(int argc,char **argv) {
  require(geteuid()==0&&argc==2&&(!strcmp(argv[1],"--check")||!strcmp(argv[1],"--install")||!strcmp(argv[1],"--replace")),"Usage: root backend --check|--install|--replace via reviewed JSON wrapper");
  FILE *range=fopen("/proc/sys/net/ipv4/ip_local_port_range","r"); int low=0,high=0;
  require(range&&fscanf(range,"%d %d",&low,&high)==2&&low>1024&&high<=65535,"Invalid global ephemeral range"); fclose(range);
  struct wire_header header;
  require(fread(&header,sizeof(header),1,stdin)==1&&header.version==1&&header.count>0&&header.count<=MAX_UIDS,"Invalid policy header");
  int inner=policy_map();
  for(uint32_t i=0;i<header.count;i++) {
    struct wire_entry entry; struct policy policy={0};
    require(fread(&entry,sizeof(entry),1,stdin)==1,"Truncated policy");
    require(entry.uid>0&&entry.uid!=1000&&entry.uid!=65534&&entry.uid<=INT32_MAX&&entry.udp_zero<=1,"Invalid dedicated UID or UDP policy");
    policy.udp_zero=entry.udp_zero;
    for(unsigned int p=0;p<MAX_PORTS;p++) {
      require(!entry.ports[p]||(entry.ports[p]>=1024&&entry.ports[p]<(uint32_t)low),"All fixed listener ports must be below global ephemeral range");
      policy.ports[p]=htons(entry.ports[p]);
    }
    put_policy(inner,entry.uid,&policy);
  }
  require(fgetc(stdin)==EOF,"Trailing policy bytes"); freeze_policy(inner);
  if(!strcmp(argv[1],"--replace")) {
    trusted_dir("/sys"); trusted_dir("/sys/fs"); trusted_dir("/sys/fs/bpf"); trusted_dir(PIN_DIR);
    int map=object("policy",-1),p4=object("bind4",-1),p6=object("bind6",-1);
    require(map>=0&&p4>=0&&p6>=0,"Existing complete pinned boundary required");
    int cg=open(CGROUP_ROOT,O_RDONLY|O_DIRECTORY|O_CLOEXEC); if(cg<0) fatal("open root cgroup");
    verify_attachment(cg,p4,BPF_CGROUP_INET4_BIND,map); verify_attachment(cg,p6,BPF_CGROUP_INET6_BIND,map);
    prevent_uid_removal(map,inner); replace_policy(map,inner);
    puts("Atomic UID bind policy replacement complete"); return 0;
  }
  int map=outer_map(inner),p4=load_guard(map,BPF_CGROUP_INET4_BIND),p6=load_guard(map,BPF_CGROUP_INET6_BIND);
  if(!strcmp(argv[1],"--check")) { puts("Policy validated and both BPF programs verified; no attachments or pins changed"); return 0; }
  trusted_dir("/sys"); trusted_dir("/sys/fs"); trusted_dir("/sys/fs/bpf"); trusted_dir(CGROUP_ROOT);
  struct statfs fs;
  require(!statfs("/sys/fs/bpf",&fs)&&fs.f_type==BPF_FS_MAGIC,"Existing bpffs required; this loader never mounts");
  require(!statfs(CGROUP_ROOT,&fs)&&fs.f_type==CGROUP2_SUPER_MAGIC,"cgroup v2 required");
  require(!mkdir(PIN_DIR,0700),"Pin directory must not already exist; inspect partial installs before retry");
  require(!object("policy",map)&&!object("bind4",p4)&&!object("bind6",p6),"Pin failure; no further attach attempted");
  int cg=open(CGROUP_ROOT,O_RDONLY|O_DIRECTORY|O_CLOEXEC); if(cg<0) fatal("open root cgroup");
  if(attach(cg,p4,BPF_CGROUP_INET4_BIND)) fatal("attach IPv4 guard; inspect partial pins");
  if(attach(cg,p6,BPF_CGROUP_INET6_BIND)) {
    /* Initial startup failed; undo only the program attached by this operation. */
    union bpf_attr a={0}; a.target_fd=cg; a.attach_bpf_fd=p4; a.attach_type=BPF_CGROUP_INET4_BIND;
    if(bpf(BPF_PROG_DETACH,&a)) fatal("IPv6 failed; IPv4 rollback also failed");
    fatal("attach IPv6 failed; IPv4 rolled back; inspect pins");
  }
  verify_attachment(cg,p4,BPF_CGROUP_INET4_BIND,map); verify_attachment(cg,p6,BPF_CGROUP_INET6_BIND,map);
  puts("UID bind boundary installed; kernel attachments persist after operator exit");
  return 0;
}
