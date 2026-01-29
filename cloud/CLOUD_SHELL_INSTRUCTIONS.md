# Running Database Migrations in Cloud Shell Terminal

## Step-by-Step Instructions

### Step 1: Open Cloud Shell
- Click the Cloud Shell icon (terminal icon) in the top right of Google Cloud Console
- Or go to: https://shell.cloud.google.com/

### Step 2: Set Your Project
```bash
gcloud config set project tax-aware-transition-tool
```

### Step 3: Create the SQL File in Cloud Shell

**Option A: Create file and paste content**
```bash
nano init-db-safe.sql
```
- Paste the entire contents of `cloud/init-db-safe.sql` from your local machine
- Press `Ctrl+X` to exit
- Press `Y` to save
- Press `Enter` to confirm

**Option B: Use Cloud Shell Editor**
```bash
cloudshell edit init-db-safe.sql
```
- This opens a web-based editor
- Paste the SQL content
- Save (Ctrl+S or File → Save)

### Step 4: Run the Migration

**Method 1: Direct execution (recommended)**
```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database < init-db-safe.sql
```

**Method 2: Interactive connection**
```bash
# Connect to database
gcloud sql connect tat-db-instance --user=postgres --database=tat_database

# Once connected (you'll see a psql prompt), type:
\i init-db-safe.sql

# Or copy-paste the SQL content directly, then type:
\q
# to exit
```

**Method 3: Using psql directly (if available)**
```bash
# First, you may need to install psql or use Cloud SQL Proxy
# But the gcloud sql connect method above should work
```

### Step 5: Verify Migration

After running, verify tables were created:
```bash
gcloud sql connect tat-db-instance --user=postgres --database=tat_database

# In psql prompt, run:
\dt

# You should see tables like: strategies, strategy_positions, etc.
# Type \q to exit
```

## Troubleshooting

**If you get "command not found":**
- Make sure you're in Cloud Shell, not your local terminal
- Try: `which gcloud` to verify gcloud is available

**If connection fails:**
- Check instance name: `gcloud sql instances list`
- Make sure database exists: Check in Cloud Console → SQL → Databases tab

**If you get permission errors:**
- Make sure you're authenticated: `gcloud auth list`
- Make sure you have SQL Admin permissions
