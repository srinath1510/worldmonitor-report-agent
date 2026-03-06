import os
import json
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

class Storage:
    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        
        if not url or not key:
            print("Warning: SUPABASE_URL or SUPABASE_KEY not set. DB operations will be skipped. Set these in your .env file.")
            self.client = None
        else:
            self.client = create_client(url, key)

    def save_snapshot(self, domain: str, payload: dict, deltas: dict = None, anomalies: dict = None):
        """Saves a domain's snapshot to the Supabase snapshots table."""
        if not self.client:
            print(f"Dry run saving {domain} snapshot: {json.dumps(payload)[:100]}...")
            return None
            
        data = {
            "collected_at": datetime.utcnow().isoformat(),
            "domain": domain,
            "payload": payload,
            "deltas": deltas or {},
            "anomalies": anomalies or {}
        }
        
        try:
            response = self.client.table("snapshots").insert(data).execute()
            return response
        except Exception as e:
            print(f"Error saving {domain} to DB: {e}")
            return None

    def update_daily_context(self, date_str: str, events: dict):
        """Updates or inserts the daily calendar context in the daily_context table."""
        if not self.client:
            print(f"Dry run saving daily context for {date_str}: {json.dumps(events)[:100]}...")
            return None
            
        data = {
            "date": date_str,
            "events_payload": events,
            "last_updated": datetime.utcnow().isoformat()
        }
        
        try:
            # Upsert
            response = self.client.table("daily_context").upsert(data).execute()
            return response
        except Exception as e:
            print(f"Error saving daily context to DB: {e}")
            return None

db = Storage()
