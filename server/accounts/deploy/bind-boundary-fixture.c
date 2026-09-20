/* SPDX-License-Identifier: MIT — disposable proof only. */
#include "bind-boundary-core.h"
#define FIXTURE_UID 61041
#define ALLOWED_PORT 3191
#define FORBIDDEN_PORT 3192
static int ephemeral_low,ephemeral_high;
static char cleanup_cgroup[180];
static char cleanup_child[200];
static pid_t fixture_owner;
static int permissive_program(void) {
  struct bpf_insn instructions[]={
    {.code=BPF_ALU64|BPF_MOV|BPF_K,.dst_reg=0,.imm=1},
    {.code=BPF_JMP|BPF_EXIT}
  };
  union bpf_attr a={0}; a.prog_type=BPF_PROG_TYPE_CGROUP_SOCK_ADDR;
  a.expected_attach_type=BPF_CGROUP_INET4_BIND; a.insn_cnt=ARRAY_SIZE(instructions);
  a.insns=(uintptr_t)instructions; a.license=(uintptr_t)"GPL";
  int fd=bpf(BPF_PROG_LOAD,&a); if(fd<0) fatal("load unrelated permissive fixture program"); return fd;
}
static void cleanup(void) {
  if(getpid()==fixture_owner&&cleanup_child[0]&&rmdir(cleanup_child)&&errno!=ENOENT)
    fputs("Fixture child cgroup cleanup needs operator inspection\n",stderr);
  if(getpid()==fixture_owner&&cleanup_cgroup[0]&&rmdir(cleanup_cgroup)&&errno!=ENOENT)
    fputs("Fixture cgroup cleanup needs operator inspection\n",stderr);
}
static int socket_bind(int family,int kind,const char *address,int port) {
  int s=socket(family,kind,0); if(s<0) fatal("socket");
  int one=1;
  if(setsockopt(s,SOL_SOCKET,SO_REUSEPORT,&one,sizeof(one))) fatal("SO_REUSEPORT");
  int rc;
  if(family==AF_INET) {
    struct sockaddr_in a={.sin_family=AF_INET,.sin_port=htons(port)};
    if(inet_pton(family,address,&a.sin_addr)!=1) abort();
    rc=bind(s,(void*)&a,sizeof(a));
  } else {
    struct sockaddr_in6 a={.sin6_family=AF_INET6,.sin6_port=htons(port)};
    if(inet_pton(family,address,&a.sin6_addr)!=1) abort();
    rc=bind(s,(void*)&a,sizeof(a));
  }
  int error=errno; close(s); errno=error; return rc;
}
static void check_bind(const char *name,int family,int kind,const char *ip,int port,int allowed) {
  errno=0;
  int rc=socket_bind(family,kind,ip,port), error=errno;
  if((allowed && rc!=0)||(!allowed && (rc==0||error!=EPERM))) {
    fprintf(stderr,"FAIL %s rc=%d errno=%d\n",name,rc,error); exit(1);
  }
  printf("PASS %s\n",name);
}
static void drop(uid_t uid) {
  if(setgroups(0,NULL)||setgid(uid)||setuid(uid)) fatal("drop UID");
}
static int wait_child(pid_t p) {
  int status; if(waitpid(p,&status,0)<0) fatal("waitpid");
  return WIFEXITED(status)?WEXITSTATUS(status):1;
}
static void probes(void) {
  drop(FIXTURE_UID);
  check_bind("listed UID approved TCP loopback",AF_INET,SOCK_STREAM,"127.0.0.1",ALLOWED_PORT,1);
  check_bind("listed UID forbidden TCP port",AF_INET,SOCK_STREAM,"127.0.0.1",FORBIDDEN_PORT,0);
  check_bind("listed UID wildcard denied",AF_INET,SOCK_STREAM,"0.0.0.0",ALLOWED_PORT,0);
  check_bind("listed UID other loopback denied",AF_INET,SOCK_STREAM,"127.0.0.2",ALLOWED_PORT,0);
  check_bind("listed UID explicit TCP ephemeral denied",AF_INET,SOCK_STREAM,"127.0.0.1",0,0);
  check_bind("listed UID IPv6 denied",AF_INET6,SOCK_STREAM,"::1",ALLOWED_PORT,0);
  check_bind("listed UID UDP fixed port denied",AF_INET,SOCK_DGRAM,"127.0.0.1",ALLOWED_PORT,0);
  check_bind("listed UID reviewed UDP ephemeral",AF_INET,SOCK_DGRAM,"0.0.0.0",0,1);
  pid_t p=fork(); if(p<0) fatal("fork");
  if(!p) {
    check_bind("fork inherits denied port",AF_INET,SOCK_STREAM,"127.0.0.1",FORBIDDEN_PORT,0);
    exit(0);
  }
  if(wait_child(p)) exit(1);
  /* A required counterexample: never call this a complete listener boundary. */
  for(int family=AF_INET;family<=AF_INET6;family+=(AF_INET6-AF_INET)) {
    int s=socket(family,SOCK_STREAM,0); if(s<0) fatal("autobind socket");
    uint32_t range=(FORBIDDEN_PORT<<16)|ALLOWED_PORT;
    if(setsockopt(s,IPPROTO_IP,51,&range,sizeof(range))) fatal("IP_LOCAL_PORT_RANGE");
    if(listen(s,1)) fatal("listen autobind counterexample changed");
    struct sockaddr_storage a; socklen_t len=sizeof(a);
    if(getsockname(s,(void*)&a,&len)) fatal("getsockname");
    int port=ntohs(family==AF_INET?((struct sockaddr_in*)&a)->sin_port:((struct sockaddr_in6*)&a)->sin6_port);
    if(port<ephemeral_low||port>ephemeral_high) { fputs("FAIL autobind escaped global range\n",stderr); exit(1); }
    printf("PASS IPv%d autobind remains in global range despite per-socket low-range override; wildcard ephemeral listener remains possible\n",family==AF_INET?4:6);
    close(s);
  }
  int s=socket(AF_INET,SOCK_DGRAM,0);
  struct sockaddr_in a={.sin_family=AF_INET,.sin_port=htons(53),.sin_addr.s_addr=htonl(INADDR_LOOPBACK)};
  if(s<0||connect(s,(void*)&a,sizeof(a))) fatal("implicit UDP connect");
  close(s); puts("PASS implicit outbound UDP connect");
  s=socket(AF_INET,SOCK_STREAM,0); a.sin_port=htons(43210);
  if(s<0||connect(s,(void*)&a,sizeof(a))) fatal("implicit outbound TCP connect");
  close(s); puts("PASS implicit outbound TCP connect");
}
int main(int argc,char **argv) {
  if(argc!=2||strcmp(argv[1],"--run-disposable-fixture")) {
    fputs("Only --run-disposable-fixture is supported. Not a production loader.\n",stderr); return 2;
  }
  if(geteuid()!=0) { fputs("Run fixture with sudo.\n",stderr); return 2; }
  setbuf(stdout,NULL);
  FILE *range=fopen("/proc/sys/net/ipv4/ip_local_port_range","r");
  if(!range||fscanf(range,"%d %d",&ephemeral_low,&ephemeral_high)!=2) fatal("read ephemeral range");
  fclose(range);
  if(FORBIDDEN_PORT>=ephemeral_low) { fputs("Fixture fixed ports must be below global ephemeral range\n",stderr); return 2; }
  /* All fixture sockets are in a fresh disconnected network namespace. */
  if(unshare(CLONE_NEWNET)) fatal("unshare network");
  int ctl=socket(AF_INET,SOCK_DGRAM,0); struct ifreq ifr={0};
  strcpy(ifr.ifr_name,"lo"); ifr.ifr_flags=IFF_UP;
  if(ctl<0||ioctl(ctl,SIOCSIFFLAGS,&ifr)) fatal("fixture loopback");
  close(ctl);
  int peer=socket(AF_INET,SOCK_STREAM,0);
  struct sockaddr_in peeraddr={.sin_family=AF_INET,.sin_port=htons(43210),.sin_addr.s_addr=htonl(INADDR_LOOPBACK)};
  if(peer<0||bind(peer,(void*)&peeraddr,sizeof(peeraddr))||listen(peer,4)) fatal("isolated outbound TCP peer");
  int inner=policy_map();
  struct policy policy={.ports={htons(ALLOWED_PORT)},.udp_zero=1};
  put_policy(inner,FIXTURE_UID,&policy); freeze_policy(inner);
  uint32_t frozen_uid=FIXTURE_UID; union bpf_attr frozen={0};
  frozen.map_fd=inner; frozen.key=(uintptr_t)&frozen_uid; frozen.value=(uintptr_t)&policy;
  if(bpf(BPF_MAP_UPDATE_ELEM,&frozen)!=-1||errno!=EPERM) fatal("frozen policy unexpectedly mutable");
  puts("PASS populated UID policy is immutable after freeze");
  int map=outer_map(inner); close(inner);
  int p4=load_guard(map,BPF_CGROUP_INET4_BIND),p6=load_guard(map,BPF_CGROUP_INET6_BIND);
  char cgpath[180],procs[240];
  snprintf(cgpath,sizeof(cgpath),"/sys/fs/cgroup/developed-bind-fixture-%ld",(long)getpid());
  if(mkdir(cgpath,0700)) fatal("mkdir fixture cgroup");
  strcpy(cleanup_cgroup,cgpath); fixture_owner=getpid(); atexit(cleanup);
  snprintf(cleanup_child,sizeof(cleanup_child),"%s/descendant",cgpath);
  if(mkdir(cleanup_child,0700)) fatal("mkdir fixture descendant");
  int cg=open(cgpath,O_RDONLY|O_DIRECTORY|O_CLOEXEC); if(cg<0) fatal("open fixture cgroup");
  int unrelated=permissive_program();
  if(attach(cg,unrelated,BPF_CGROUP_INET4_BIND)) fatal("attach unrelated permissive fixture program");
  if(attach(cg,p4,BPF_CGROUP_INET4_BIND)||attach(cg,p6,BPF_CGROUP_INET6_BIND)) fatal("attach guard");
  /* Child enters only this new cgroup; parent and all production units stay out. */
  snprintf(procs,sizeof(procs),"%s/cgroup.procs",cleanup_child);
  pid_t p=fork(); if(p<0) fatal("fork fixture");
  if(!p) {
    int f=open(procs,O_WRONLY|O_CLOEXEC); if(f<0||write(f,"0",1)!=1) fatal("join fixture cgroup"); close(f);
    /* No BPF/cgroup descriptor reaches unprivileged test processes. */
    close(map); close(p4); close(p6); close(cg); close(peer); close(unrelated);
    pid_t other=fork(); if(other<0) fatal("fork unlisted");
    if(!other) {
      drop(FIXTURE_UID+1);
      check_bind("unlisted UID unchanged",AF_INET,SOCK_STREAM,"0.0.0.0",FORBIDDEN_PORT,1);
      exit(0);
    }
    if(wait_child(other)) exit(1);
    probes(); exit(0);
  }
  int result=wait_child(p);
  if(!result) {
    inner=policy_map();
    policy.ports[0]=htons(FORBIDDEN_PORT);
    put_policy(inner,FIXTURE_UID,&policy); freeze_policy(inner);
    replace_policy(map,inner); close(inner);
    p=fork(); if(p<0) fatal("fork replacement");
    if(!p) {
      int f=open(procs,O_WRONLY|O_CLOEXEC); if(f<0||write(f,"0",1)!=1) fatal("join fixture cgroup"); close(f);
      close(map); close(p4); close(p6); close(cg); close(peer); close(unrelated); drop(FIXTURE_UID);
      check_bind("atomic replacement denies formerly allowed port",AF_INET,SOCK_STREAM,"127.0.0.1",ALLOWED_PORT,0);
      check_bind("atomic replacement allows new reviewed port",AF_INET,SOCK_STREAM,"127.0.0.1",FORBIDDEN_PORT,1);
      check_bind("replacement preserves IPv6 denial",AF_INET6,SOCK_STREAM,"::1",FORBIDDEN_PORT,0);
      exit(0);
    }
    result=wait_child(p);
  }
  /* Remove only the exact empty disposable cgroup, dropping its attachments. */
  if(rmdir(cleanup_child)) fatal("remove fixture descendant");
  cleanup_child[0]=0;
  if(rmdir(cgpath)) fatal("remove fixture cgroup");
  cleanup_cgroup[0]=0;
  close(cg); close(p4); close(p6); close(map); close(peer); close(unrelated);
  return result;
}
