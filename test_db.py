import asyncpg
import asyncio

async def test():
    try:
        conn = await asyncpg.connect('postgresql://postgres:04082003Mugen*@db.yitkwdveaksiabppwuck.supabase.co:6543/postgres')
        version = await conn.fetchval('SELECT version()')
        print(f'OK: Connected to PostgreSQL')
        tables = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        print(f'Tables: {len(tables)}')
        for t in tables[:10]:
            print(f'  - {t["tablename"]}')
        await conn.close()
    except Exception as e:
        print(f'ERROR: {e}')

asyncio.run(test())