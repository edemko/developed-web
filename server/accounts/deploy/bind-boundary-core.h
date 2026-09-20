/* SPDX-License-Identifier: MIT — shared raw BPF instruction builder. */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <linux/bpf.h>
#include <net/if.h>
#include <sched.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
#define MAX_PORTS 16
#define MAX_UIDS 64
struct policy { uint32_t ports[MAX_PORTS]; uint32_t udp_zero; };
static void fatal(const char *s) { perror(s); exit(1); }
static int bpf(enum bpf_cmd cmd, union bpf_attr *a) {
  return syscall(SYS_bpf, cmd, a, sizeof(*a));
}
static struct bpf_insn insns[256];
static unsigned int count;
static void emit(unsigned char code, unsigned char dst, unsigned char src,
                 short off, int imm) {
  insns[count++] = (struct bpf_insn){.code=code,.dst_reg=dst,.src_reg=src,.off=off,.imm=imm};
  if (count >= ARRAY_SIZE(insns)) abort();
}
#define MOV(d,s) emit(BPF_ALU64|BPF_MOV|BPF_X,d,s,0,0)
#define IMM(d,v) emit(BPF_ALU64|BPF_MOV|BPF_K,d,0,0,v)
#define LOAD(d,s,o) emit(BPF_LDX|BPF_MEM|BPF_W,d,s,o,0)
#define CALL(h) emit(BPF_JMP|BPF_CALL,0,0,0,h)
static unsigned int jump(unsigned char op, unsigned char reg, int value) {
  unsigned int pos=count; emit(BPF_JMP|op|BPF_K,reg,0,0,value); return pos;
}
static void target(unsigned int branch, unsigned int destination) {
  insns[branch].off = (short)(destination - branch - 1);
}

static int load_guard(int map, enum bpf_attach_type type) {
  unsigned int deny[12], nd=0, allow[MAX_PORTS+4], na=0;
  count=0;
  MOV(6,1);
  CALL(BPF_FUNC_get_current_uid_gid);
  emit(BPF_STX|BPF_MEM|BPF_W,10,0,-4,0); /* lower 32 bits: real UID */
  emit(BPF_ST|BPF_MEM|BPF_W,10,0,-8,0); /* outer-map key */
  emit(BPF_LD|BPF_DW|BPF_IMM,1,BPF_PSEUDO_MAP_FD,0,map);
  emit(0,0,0,0,0);
  MOV(2,10); emit(BPF_ALU64|BPF_ADD|BPF_K,2,0,0,-8);
  CALL(BPF_FUNC_map_lookup_elem);
  deny[nd++]=jump(BPF_JEQ,0,0); /* broken outer slot fails closed */
  MOV(1,0);
  MOV(2,10); emit(BPF_ALU64|BPF_ADD|BPF_K,2,0,0,-4);
  CALL(BPF_FUNC_map_lookup_elem);
  allow[na++]=jump(BPF_JEQ,0,0); /* all unlisted UIDs unchanged */
  if (type == BPF_CGROUP_INET6_BIND) {
    deny[nd++]=jump(BPF_JA,0,0);
  } else {
    MOV(7,0);
    LOAD(2,6,offsetof(struct bpf_sock_addr,protocol));
    unsigned int udp=jump(BPF_JEQ,2,IPPROTO_UDP);
    deny[nd++]=jump(BPF_JNE,2,IPPROTO_TCP);
    LOAD(2,6,offsetof(struct bpf_sock_addr,user_ip4));
    deny[nd++]=jump(BPF_JNE,2,htonl(INADDR_LOOPBACK));
    LOAD(2,6,offsetof(struct bpf_sock_addr,user_port));
    deny[nd++]=jump(BPF_JEQ,2,0);
    for(unsigned int i=0;i<MAX_PORTS;i++) {
      LOAD(3,7,offsetof(struct policy,ports)+sizeof(uint32_t)*i);
      allow[na++]=count; emit(BPF_JMP|BPF_JEQ|BPF_X,2,3,0,0);
    }
    deny[nd++]=jump(BPF_JA,0,0);
    target(udp,count);
    LOAD(2,7,offsetof(struct policy,udp_zero));
    deny[nd++]=jump(BPF_JEQ,2,0);
    LOAD(2,6,offsetof(struct bpf_sock_addr,user_port));
    deny[nd++]=jump(BPF_JNE,2,0);
    LOAD(2,6,offsetof(struct bpf_sock_addr,user_ip4));
    allow[na++]=jump(BPF_JEQ,2,0);
    deny[nd++]=jump(BPF_JNE,2,htonl(INADDR_LOOPBACK));
  }
  unsigned int yes=count; IMM(0,1); emit(BPF_JMP|BPF_EXIT,0,0,0,0);
  unsigned int no=count; IMM(0,0); emit(BPF_JMP|BPF_EXIT,0,0,0,0);
  for (unsigned int i=0;i<na;i++) target(allow[i],yes);
  for (unsigned int i=0;i<nd;i++) target(deny[i],no);
  char log[32768]={0};
  union bpf_attr a={0};
  a.prog_type=BPF_PROG_TYPE_CGROUP_SOCK_ADDR;
  strcpy(a.prog_name,type==BPF_CGROUP_INET4_BIND?"dev_bind4_v1":"dev_bind6_v1");
  a.expected_attach_type=type; a.insn_cnt=count;
  a.insns=(uintptr_t)insns; a.license=(uintptr_t)"GPL";
  a.log_buf=(uintptr_t)log; a.log_size=sizeof(log); a.log_level=1;
  int fd=bpf(BPF_PROG_LOAD,&a);
  if(fd<0) { fprintf(stderr,"Verifier: %s\n",log); fatal("BPF_PROG_LOAD"); }
  return fd;
}
static int attach(int cg, int prog, enum bpf_attach_type type) {
  union bpf_attr a={0}; a.target_fd=cg; a.attach_bpf_fd=prog;
  a.attach_type=type; a.attach_flags=BPF_F_ALLOW_MULTI;
  return bpf(BPF_PROG_ATTACH,&a);
}

static int policy_map(void) {
  union bpf_attr a={0}; a.map_type=BPF_MAP_TYPE_HASH;
  a.key_size=sizeof(uint32_t); a.value_size=sizeof(struct policy); a.max_entries=MAX_UIDS;
  int fd=bpf(BPF_MAP_CREATE,&a); if(fd<0) fatal("create policy map"); return fd;
}
static void put_policy(int map,uint32_t uid,const struct policy *policy) {
  union bpf_attr a={0}; a.map_fd=map; a.key=(uintptr_t)&uid;
  a.value=(uintptr_t)policy; a.flags=BPF_NOEXIST;
  if(bpf(BPF_MAP_UPDATE_ELEM,&a)) fatal("populate policy map");
}
static void freeze_policy(int map) {
  union bpf_attr a={0}; a.map_fd=map;
  if(bpf(BPF_MAP_FREEZE,&a)) fatal("freeze policy map");
}
static void replace_policy(int outer,int inner) {
  uint32_t zero=0,value=inner;
  union bpf_attr a={0}; a.map_fd=outer; a.key=(uintptr_t)&zero; a.value=(uintptr_t)&value;
  if(bpf(BPF_MAP_UPDATE_ELEM,&a)) fatal("atomic policy replacement");
}
static int outer_map(int inner) {
  union bpf_attr a={0}; a.map_type=BPF_MAP_TYPE_ARRAY_OF_MAPS;
  a.key_size=sizeof(uint32_t); a.value_size=sizeof(uint32_t); a.max_entries=1;
  a.inner_map_fd=inner;
  int fd=bpf(BPF_MAP_CREATE,&a); if(fd<0) fatal("create outer map");
  replace_policy(fd,inner); return fd;
}
