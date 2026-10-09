#!/bin/bash
# /usr/local/bin/hcdave-automount.sh
# Automounts USB/SATA drives dynamically for HC Cloud without polluting fstab.

ACTION=$1
DEVBASE=$2
DEVICE="/dev/${DEVBASE}"
UUID=$3
LABEL=$4

# Log to syslog for easy debugging
logger -t hcdave-automount "Action: $ACTION for $DEVICE (UUID: $UUID, LABEL: $LABEL)"

if [ "$ACTION" = "add" ]; then
    # Give the system a fraction of a second to settle block device
    sleep 0.5
    
    # Ignore if we don't have a UUID (not a formatted filesystem)
    if [ -z "$UUID" ]; then
        logger -t hcdave-automount "Skipping $DEVICE: No UUID detected."
        exit 0
    fi
    
    # Skip OS drives by checking if it's the root device or part of it
    ROOT_DEV=$(findmnt -n -o SOURCE /)
    if [[ "$DEVICE" == "$ROOT_DEV"* ]] || [[ "$ROOT_DEV" == "$DEVICE"* ]]; then
        logger -t hcdave-automount "Skipping $DEVICE: Looks like the root filesystem."
        exit 0
    fi
    
    # Extract file system type
    TYPE=$(blkid -s TYPE -o value ${DEVICE})
    if [ -z "$TYPE" ] || [ "$TYPE" = "swap" ]; then
        logger -t hcdave-automount "Skipping $DEVICE: Type is $TYPE (unsupported or swap)."
        exit 0
    fi
    
    # Determine the mount path
    if [ -n "$LABEL" ]; then
        # Replace spaces or weird characters with underscores for a clean mount path
        LABEL_SAFE=$(echo "$LABEL" | sed 's/[^a-zA-Z0-9_-]/_/g')
        MNT_DIR="/mnt/$LABEL_SAFE"
    else
        MNT_DIR="/mnt/$UUID"
    fi
    
    # Prevent mounting if it's already mounted (e.g., via fstab)
    if findmnt -n -o TARGET ${DEVICE} > /dev/null; then
        EXISTING=$(findmnt -n -o TARGET ${DEVICE})
        logger -t hcdave-automount "Skipping $DEVICE: Already mounted at $EXISTING."
        exit 0
    fi
    
    mkdir -p "$MNT_DIR"
    
    # Mount command
    if [[ "$TYPE" == "exfat" || "$TYPE" == "vfat" || "$TYPE" == "ntfs" ]]; then
        # Ensure agent running as normal user can read/write
        mount -o defaults,uid=1000,gid=1000,dmask=000,fmask=000 ${DEVICE} "$MNT_DIR"
    else
        mount ${DEVICE} "$MNT_DIR"
    fi
    
    if [ $? -eq 0 ]; then
        logger -t hcdave-automount "Successfully mounted $DEVICE at $MNT_DIR"
    else
        logger -t hcdave-automount "Failed to mount $DEVICE at $MNT_DIR"
        rmdir "$MNT_DIR" 2>/dev/null
    fi

elif [ "$ACTION" = "remove" ]; then
    # When removed, the device node is gone. We must find dead mounts.
    # We iterate over everything in /mnt and clean up things that have no block device anymore.
    logger -t hcdave-automount "Checking for dead mounts in /mnt after removal of $DEVICE"
    for dir in /mnt/*; do
        if [ -d "$dir" ] && mountpoint -q "$dir"; then
            # Check if the source device still exists
            SRC=$(findmnt -n -o SOURCE "$dir")
            if [ -n "$SRC" ] && [[ "$SRC" == /dev/* ]] && [ ! -e "$SRC" ]; then
                logger -t hcdave-automount "Cleaning up dead mount: $dir (was $SRC)"
                umount -l "$dir"
                rmdir "$dir" 2>/dev/null
            fi
        elif [ -d "$dir" ]; then
            # Empty directory that isn't a mountpoint (possible leftover)
            # Only remove if it's completely empty
            rmdir "$dir" 2>/dev/null
        fi
    done
fi
