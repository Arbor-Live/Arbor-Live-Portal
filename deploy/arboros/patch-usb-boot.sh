#!/bin/sh
# rpi-image-gen's rpi-storage-binder only recognizes the boot device for SD
# (boot-mode 1, mmcblk0) and NVMe (boot-mode 6, nvme0n1). Booting from USB mass
# storage (sdX) therefore never gets tagged, the /dev/disk/by-slot/* symlinks the
# image roots from are never created, and with rootwait the boot hangs forever.
#
# Teach it about USB: add a udev rule for sdX partitions and derive the disk from
# the device node the rule is invoked with. Also make the "partition 0 means the
# first partition" mapping unconditional, since Pi 4/5 firmware can report 0.
#
# Usage: patch-usb-boot.sh <path-to-rpi-image-gen checkout>
set -eu

ROOT="${1:?usage: patch-usb-boot.sh <rpi-image-gen dir>}"

python3 - "$ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])

rules = root / "layer/rpi/device/storage-binder/udev/rules.d/storage-binder.rules"
text = rules.read_text()
if 'KERNEL=="sd[a-z][0-9]*"' not in text:
    usb_rule = (
        "# Non-DM partitions: USB mass storage (sdX)\n"
        'SUBSYSTEM=="block", KERNEL=="sd[a-z][0-9]*", ACTION=="add|change", \\\n'
        '  IMPORT{program}="/usr/bin/rpi-bootdev-tag -u -d $env{DEVNAME}"\n\n'
    )
    if "# DM devices" not in text:
        raise SystemExit("patch-usb-boot: storage-binder.rules marker not found")
    rules.write_text(text.replace("# DM devices", usb_rule + "# DM devices", 1))

tag = root / "layer/rpi/device/storage-binder/bin/rpi-bootdev-tag"
text = tag.read_text()

old_case = (
    "case $BOOT_MODE in\n"
    "   1) BOOT_DEV=mmcblk0; PART_SEP=p;;\n"
    "   6) BOOT_DEV=nvme0n1; PART_SEP=p;;\n"
    "   *) exit 1;; # Not a storage device, or one we can associate to a linux blkdev\n"
    "esac"
)
new_case = (
    "case $BOOT_MODE in\n"
    "   1) BOOT_DEV=mmcblk0; PART_SEP=p;;\n"
    "   6) BOOT_DEV=nvme0n1; PART_SEP=p;;\n"
    "   *) # USB mass storage: derive the disk from the udev device (sda1 -> sda)\n"
    "      case $DEVNAME in\n"
    '         /dev/sd[a-z]*) BOOT_DEV=${DEVNAME%%[0-9]*}; BOOT_DEV=${BOOT_DEV##*/}; PART_SEP="";;\n'
    "         *) exit 1;;\n"
    "      esac;;\n"
    "esac"
)
if old_case not in text:
    raise SystemExit("patch-usb-boot: boot-mode case not found in rpi-bootdev-tag")
text = text.replace(old_case, new_case, 1)

old_compat = (
    "case $GEN in\n"
    "   4|5);;\n"
    "   *) [ $BOOT_PARTN -eq 0 ] && BOOT_PARTN=1;; # legacy compat\n"
    "esac"
)
if old_compat in text:
    text = text.replace(
        old_compat,
        '[ "$BOOT_PARTN" -eq 0 ] && BOOT_PARTN=1 # partition indexes can be 0-based',
        1,
    )
tag.write_text(text)
print("patched rpi-image-gen for USB boot")
PY
