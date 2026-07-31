# Server Audit — KMKT Social AI

**Audit date:** 2026-07-30
**Audited by:** Lead Software Architect / DevOps Engineer
**Sprint:** SPRINT -1 (Server Foundation)
**Purpose:** Establish a factual baseline of the host before any application, tooling, or infrastructure work begins.

---

## 1. Host Summary

| Attribute      | Value                                             |
| -------------- | ------------------------------------------------- |
| Hostname       | `metrabyte`                                       |
| Role           | Application / build host for KMKT Social AI        |
| Environment    | Server foundation (pre-development)                |

---

## 2. Operating System

| Attribute        | Value                                            |
| ---------------- | ------------------------------------------------ |
| Distributor      | Ubuntu                                            |
| Description      | Ubuntu 24.04.4 LTS                                |
| Release          | 24.04                                             |
| Codename         | noble                                            |
| Kernel           | Linux 6.8.0-136-generic                           |
| Kernel build     | #136-Ubuntu SMP PREEMPT_DYNAMIC Wed Jul 1 2026    |
| Architecture     | x86_64                                            |
| Init system      | systemd 255 (255.4-1ubuntu8.16)                   |

Ubuntu 24.04 LTS is a Long-Term Support release, giving this host a stable and supported base for the lifetime of the project.

---

## 3. CPU

| Attribute            | Value                                          |
| -------------------- | ---------------------------------------------- |
| Model                | Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz      |
| Vendor               | GenuineIntel                                   |
| Architecture         | x86_64                                         |
| Logical CPUs         | 2                                              |
| Sockets              | 1                                              |
| Cores per socket     | 2                                              |
| Threads per core     | 1                                              |
| Base clock           | 2.30 GHz                                        |

The host presents 2 logical cores. This is adequate for a foundation and lightweight service host, but is a known constraint for parallel builds and future container workloads. It is recorded here so that capacity planning in later sprints accounts for it.

---

## 4. Memory (RAM)

| Attribute          | Value    |
| ------------------ | -------- |
| Total RAM          | 3.8 GiB  |
| Used (at audit)    | 613 MiB  |
| Free (at audit)    | 2.9 GiB  |
| Buffer / cache     | 505 MiB  |
| Available          | 3.2 GiB  |
| Swap total         | 2.0 GiB  |
| Swap used          | 0 B      |

Roughly 3.2 GiB is available at rest. Swap is configured (2.0 GiB) and currently unused. Memory is a planning constraint for future database and container workloads and must be tracked against service footprints as they are introduced.

---

## 5. Disk

### Filesystems

| Filesystem                     | Size | Used | Avail | Use% | Mount |
| ------------------------------ | ---- | ---- | ----- | ---- | ----- |
| `/dev/mapper/ubuntu--vg-lv--0` | 57G  | 5.8G | 49G   | 11%  | `/`   |
| `/dev/sda2`                    | 2.0G | 296M | 1.5G  | 17%  | `/boot` |

### Block devices

| Device               | Size  | Type | Mount   |
| -------------------- | ----- | ---- | ------- |
| `sda`                | 60G   | disk | —       |
| `sda1`               | 1M    | part | —       |
| `sda2`               | 2G    | part | `/boot` |
| `sda3`               | 58G   | part | —       |
| `ubuntu--vg-lv--0`   | 58G   | lvm  | `/`     |
| `sr0`                | 1024M | rom  | —       |

The root filesystem sits on LVM (`ubuntu--vg-lv--0`), which allows the volume to be extended later without repartitioning. Approximately 49 GiB is free on root — sufficient for the documentation and workspace scope of this sprint with substantial headroom for future work.

---

## 6. Users

### Root / audit session

| Attribute | Value                     |
| --------- | ------------------------- |
| User      | `root` (uid=0)            |
| Groups    | `root`                    |
| Session   | `pts/0` from `49.228.22.163` |

### Human accounts (uid ≥ 1000)

| User    | UID  | Home          | Shell       |
| ------- | ---- | ------------- | ----------- |
| `lotus` | 1000 | `/home/lotus` | `/bin/bash` |

One non-system human account (`lotus`) exists in addition to `root`. This is documented so that ownership and permission decisions in later sprints are made deliberately rather than by default.

---

## 7. Existing Software

### Installed and available

| Tool           | Version / Detail                          | Path            |
| -------------- | ----------------------------------------- | --------------- |
| Git            | 2.43.0                                     | `/usr/bin/git`  |
| Python 3       | 3.12.3                                     | `/usr/bin/python3` |
| curl           | 8.5.0                                      | `/usr/bin/curl` |
| wget           | 1.21.4                                     | `/usr/bin/wget` |
| GNU Make       | 4.3                                        | `/usr/bin/make` |
| GCC            | 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04.1)   | `/usr/bin/gcc`  |
| systemd        | 255 (255.4-1ubuntu8.16)                    | `/usr/bin/systemctl` |

### Not installed

The following were checked and are **not present** on the host. This is expected and correct for the current stage — no runtime or platform software is to be installed during SPRINT -1.

| Tool             | Status        |
| ---------------- | ------------- |
| Docker           | NOT INSTALLED |
| Docker Compose   | NOT INSTALLED |
| Node.js          | NOT INSTALLED |
| npm              | NOT INSTALLED |
| pnpm             | NOT INSTALLED |
| yarn             | NOT INSTALLED |
| pip3             | NOT INSTALLED |
| MySQL            | NOT INSTALLED |
| MariaDB          | NOT INSTALLED |
| nginx            | NOT INSTALLED |

---

## 8. Existing Toolchain — Focused Findings

### Docker
Not installed. No Docker Engine, Docker Compose, container images, or runtime present. Containerisation is explicitly out of scope for this sprint and is not to be introduced here.

### Git
Installed — version 2.43.0 at `/usr/bin/git`. The version control client is available and ready for repository initialisation. The working directory (`/opt/kmkt/projects/social-ai`) is **not yet** a Git repository at the time of audit.

### Node.js
Not installed. No Node.js, npm, pnpm, or yarn runtime is present. JavaScript/TypeScript runtime installation is out of scope for this sprint.

### Python
Installed — Python 3.12.3 at `/usr/bin/python3`, the system interpreter shipped with Ubuntu 24.04. `pip3` is not installed. No project virtual environment exists. Python is available for utility scripting if ever required, but no dependencies are to be installed during this sprint.

---

## 9. Assessment for SPRINT -1

| Dimension            | Status  | Note                                                        |
| -------------------- | ------- | ----------------------------------------------------------- |
| OS suitability       | Good    | Ubuntu 24.04 LTS — supported, stable base.                  |
| CPU capacity         | Limited | 2 logical cores — a known constraint for future builds.     |
| Memory capacity      | Limited | ~3.2 GiB available — must be tracked against service growth. |
| Disk capacity        | Good    | ~49 GiB free on LVM root, extendable.                       |
| Version control      | Ready   | Git installed; repository initialisation pending.           |
| Clean baseline       | Yes     | No runtime/platform software preinstalled — no conflicts.   |

**Conclusion.** The host is a clean, supported Ubuntu 24.04 LTS server with a minimal toolchain (Git, Python, standard build utilities). It is a suitable foundation for the KMKT Social AI workspace. CPU and RAM are the two constraints to carry forward into capacity planning. No blocking issues exist for the documentation and repository-preparation objectives of SPRINT -1.
