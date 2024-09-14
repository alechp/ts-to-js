#!/bin/bash

# Function to log styled messages
log() {
    gum style --foreground 212 --border normal --margin "1 2" --padding "1 2" "$1"
}

# Step 1: Clean up and unzip in the sandbox directory
log "Step 1: Cleaning up and unzipping in sandbox directory"
cd /Users/alechp/Code/alechp/.repositories/sandbox/2024/09-14-astro-flowbite-admin
rm -Rf flowbite-astro-admin-dashboard-main
unzip flowbite-astro-admin-dashboard-main.zip

# Step 2: Run the start script in ts-to-js directory
log "Step 2: Running start script in ts-to-js directory"
cd /Users/alechp/Code/alechp/.repositories/ts-to-js
echo "/Users/alechp/Code/alechp/.repositories/sandbox/2024/09-14-astro-flowbite-admin/flowbite-astro-admin-dashboard-main" | bun run start

# Step 3: Install dependencies and run dev script in the correct directory
log "Step 3: Installing dependencies and running dev script"
cd /Users/alechp/Code/alechp/.repositories/sandbox/2024/09-14-astro-flowbite-admin/flowbite-astro-admin-dashboard-main
bun install

if [ $? -eq 0 ]; then
    log "Dependencies installed successfully. Running dev script..."
    bun run dev
else
    log "Failed to install dependencies. Please check for errors above."
fi