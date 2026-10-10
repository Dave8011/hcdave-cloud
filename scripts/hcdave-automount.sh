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
    
    # Check if this device is configured in /etc/fstab
    FSTAB_TARGET=$(findmnt -s -n -o TARGET UUID="$UUID")
    IS_FSTAB="no"

    if [ -n "$FSTAB_TARGET" ]; then
        MNT_DIR="$FSTAB_TARGET"
        IS_FSTAB="yes"
        logger -t hcdave-automount "Device $DEVICE (UUID: $UUID) found in fstab at $FSTAB_TARGET"
    else
        # Determine the fallback mount path dynamically
        if [ -n "$LABEL" ]; then
            LABEL_SAFE=$(echo "$LABEL" | sed 's/[^a-zA-Z0-9_-]/_/g')
            MNT_DIR="/mnt/$LABEL_SAFE"
        else
            MNT_DIR="/mnt/$UUID"
        fi
    fi
    
    # Prevent mounting if it's already mounted
    EXISTING=$(findmnt -n -o TARGET ${DEVICE})
    if [ -n "$EXISTING" ]; then
        logger -t hcdave-automount "Skipping $DEVICE: Already mounted at $EXISTING."
        exit 0
    fi
    
    # Only create mount directory if we are dynamically assigning it
    if [ "$IS_FSTAB" = "no" ]; then
        mkdir -p "$MNT_DIR"
        
        # Mount with our custom permission masks
        if [[ "$TYPE" == "exfat" || "$TYPE" == "vfat" || "$TYPE" == "ntfs" || "$TYPE" == "ntfs3" ]]; then
            MOUNT_OUT=$(mount -o defaults,uid=1000,gid=1000,dmask=000,fmask=000 ${DEVICE} "$MNT_DIR" 2>&1)
        else
            MOUNT_OUT=$(mount ${DEVICE} "$MNT_DIR" 2>&1)
        fi
    else
        # If it's in fstab, let standard mount handle everything (options, existing directory)
        MOUNT_OUT=$(mount ${DEVICE} 2>&1)
    fi
    
    if [ $? -eq 0 ]; then
        logger -t hcdave-automount "Successfully mounted $DEVICE at $MNT_DIR"
        # Save state: path and whether it was from fstab
        echo "$MNT_DIR:$IS_FSTAB" > "$STATE_FILE"
    else
        logger -t hcdave-automount "Failed to mount $DEVICE at $MNT_DIR. Error: $MOUNT_OUT"
        if [ "$IS_FSTAB" = "no" ]; then
            rmdir "$MNT_DIR" 2>/dev/null
        fi
    fi

elif [ "$ACTION" = "remove" ]; then
    if [ -f "$STATE_FILE" ]; then
        STATE=$(cat "$STATE_FILE")
        MNT_DIR="${STATE%:*}"
        IS_FSTAB="${STATE#*:}"
        
        logger -t hcdave-automount "Cleaning up managed mount: $MNT_DIR for $DEVICE (fstab: $IS_FSTAB)"
        umount -l "$MNT_DIR"
        
        # We only remove the directory if we created it dynamically
        if [ "$IS_FSTAB" = "no" ]; then
            rmdir "$MNT_DIR" 2>/dev/null
        fi
        rm -f "$STATE_FILE"
    else
        logger -t hcdave-automount "No state file found for $DEVICE. It was not managed by automount."
    fi
fi
