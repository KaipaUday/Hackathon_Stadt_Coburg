from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from config.settings import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def test_connection():
    with engine.connect() as conn:
        return conn.execute(text("SELECT version()")).scalar()
