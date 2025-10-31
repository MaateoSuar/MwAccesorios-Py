import os
import psycopg2
import psycopg2.extras

_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

def has_db() -> bool:
    return bool(_DATABASE_URL)

def get_conn():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL no configurado")
    conn = psycopg2.connect(_DATABASE_URL)
    return conn

def execute(query: str, params: tuple = ()): 
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()

def fetchall(query: str, params: tuple = ()): 
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [dict(r) for r in rows]
