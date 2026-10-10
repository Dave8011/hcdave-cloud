#!/bin/bash
# /usr/local/bin/hcdave-automount.sh
# Automounts USB/SATA drives dynamically via systemd dispatcher.

ACTION=$1
DEVBASE=$2
DEVICE="/dev/${DEVBASE}"
STATE_FILE="/var/run/hcdave-automount-${DEVBASE}.mnt"

if [ "$ACTION" = "add" ]; then
    # Give the system a fraction of a second to settle block device
    sleep 0.5
    
    # Grab details using blkid (since udev environment variables aren't passed by systemd by default)
    UUID=$(blkid -s UUID -o value ${DEVICE})
    LABEL=$(blkid -s LABEL -o value ${DEVICE})
    TYPE=$(blkid -s TYPE -o value ${DEVICE})
    
    logger -t hcdave-automount "Action: add for $DEVICE (UUID: $UUID, LABEL: $LABEL, TYPE: $TYPE)"
    
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
    
    if [ -z "$TYPE" ] || [ "$TYPE" = "swap" ]; then
        logger -t hcdave-automount "Skipping $DEVICE: Type is $TYPE (unsupported or swap)."
        exit 0
    fi
    
    # Determine the mount path
    if [ -n "$LABEL" ]; then
        LABEL_SAFE=$(echo "$LABEL" | sed 's/[^a-zA-Z0-9_-]/_/g')
        MNT_DIR="/mnt/$LABEL_SAFE"
    else
        MNT_DIR="/mnt/$UUID"
    fi
    
    # Prevent mounting if it's already mounted (e.g., Gallery and Supra1 in fstab)
    EXISTING=$(findmnt -n -o TARGET ${DEVICE})
    if [ -n "$EXISTING" ]; then
        logger -t hcdave-automount "Skipping $DEVICE: Already mounted at $EXISTING."
        exit 0
    fi
    
    mkdir -p "$MNT_DIR"
    
    # Mount command - capturing stderr and stdout for debugging
    if [[ "$TYPE" == "exfat" || "$TYPE" == "vfat" || "$TYPE" == "ntfs" || "$TYPE" == "ntfs3" ]]; then
        MOUNT_OUT=$(mount -o defaults,uid=1000,gid=1000,dmask=000,fmask=000 ${DEVICE} "$MNT_DIR" 2>&1)
    else
        MOUNT_OUT=$(mount ${DEVICE} "$MNT_DIR" 2>&1)
    fi
    
    if [ $? -eq 0 ]; then
        logger -t hcdave-automount "Successfully mounted $DEVICE at $MNT_DIR"
        # Save state so we know exactly what we mounted
        echo "$MNT_DIR" > "$STATE_FILE"
    else
        logger -t hcdave-automount "Failed to mount $DEVICE at $MNT_DIR. Error: $MOUNT_OUT"
        rmdir "$MNT_DIR" 2>/dev/null
    fi

elif [ "$ACTION" = "remove" ]; then
    if [ -f "$STATE_FILE" ]; then
        MNT_DIR=$(cat "$STATE_FILE")
        logger -t hcdave-automount "Cleaning up managed mount: $MNT_DIR for $DEVICE"
        umount -l "$MNT_DIR"
        rmdir "$MNT_DIR" 2>/dev/null
        rm -f "$STATE_FILE"
    else
        logger -t hcdave-automount "No state file found for $DEVICE. It was not managed by automount."
    fi
fi
