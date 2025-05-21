import os
import pyodbc
from dotenv import load_dotenv
from datetime import datetime, timedelta
import pytz

# Define timezone constant for application (GMT+3)
TIMEZONE = pytz.timezone('Europe/Istanbul')  # Turkey is in GMT+3

load_dotenv()

def get_db_connection():
    try:
        conn = pyodbc.connect(
            f'DRIVER={{ODBC Driver 18 for SQL Server}};'
            f'SERVER={os.getenv("DB_SERVER")};'
            f'DATABASE={os.getenv("DB_NAME")};'
            f'UID={os.getenv("DB_USER")};'
            f'PWD={os.getenv("DB_PASSWORD")};'
            'Trusted_Connection=no;'
            'TrustServerCertificate=yes;'
            'Encrypt=yes;'
        )
        return conn
    except pyodbc.Error as e:
        print(f"Error connecting to database: {str(e)}")
        print(f"Using connection string parameters:")
        print(f"Server: {os.getenv('DB_SERVER')}")
        print(f"Database: {os.getenv('DB_NAME')}")
        print(f"User: {os.getenv('DB_USER')}")
        raise

def get_production_units():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT UnitName FROM ProductRecordLogView ORDER BY UnitName")
    units = [row[0] for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return units

def get_production_data(unit_name, start_time, end_time, current_time=None):
    # print("\n=== get_production_data called ===")
    # print(f"Input parameters:")
    # print(f"- Unit name: {unit_name}")
    # print(f"- Start time: {start_time} (type: {type(start_time)}, tzinfo: {start_time.tzinfo})")
    # print(f"- End time: {end_time} (type: {type(end_time)}, tzinfo: {end_time.tzinfo})")
    # if current_time:
    #     print(f"- Current time: {current_time} (type: {type(current_time)}, tzinfo: {current_time.tzinfo})")
    
    # If current_time is not provided, use end_time
    actual_end_time = current_time if current_time else end_time
    
    # Ensure all datetimes use the same timezone (GMT+3)
    if start_time.tzinfo is None:
        start_time = TIMEZONE.localize(start_time)
    elif start_time.tzinfo != TIMEZONE:
        start_time = start_time.astimezone(TIMEZONE)
        
    if actual_end_time.tzinfo is None:
        actual_end_time = TIMEZONE.localize(actual_end_time)
    elif actual_end_time.tzinfo != TIMEZONE:
        actual_end_time = actual_end_time.astimezone(TIMEZONE)
    
    # Ensure actual_end_time is not before start_time
    if actual_end_time < start_time:
        actual_end_time = start_time
        # print(f"Warning: Adjusted actual_end_time to match start_time as it was earlier")
    
    # For database query, always use the original end_time but ensure proper timezone
    query_end_time = end_time
    if query_end_time.tzinfo is None:
        query_end_time = TIMEZONE.localize(query_end_time)
    elif query_end_time.tzinfo != TIMEZONE:
        query_end_time = query_end_time.astimezone(TIMEZONE)
    
    # print(f"All times normalized to GMT+3 (Europe/Istanbul)")
    # print(f"Normalized query times: {start_time} to {query_end_time}")
    # print(f"Using operational end time: {actual_end_time}")
    
    # Ensure we're using the current time for real-time data
    current_query_time = datetime.now(TIMEZONE)
    # print(f"Current database query time: {current_query_time}")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Now execute the main query with the most current end time
    query = """
    SELECT 
        Model,
        SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) as SuccessQty,
        SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) as FailQty,
        ModelSuresiSN as Target
    FROM 
        ProductRecordLogView
    WHERE 
        UnitName = ? 
        AND KayitTarihi BETWEEN ? AND ?
    GROUP BY 
        Model, ModelSuresiSN
    """
    
    # print(f"\nExecuting main query for time range:")
    # print(f"Start: {start_time}")
    # print(f"Query End: {query_end_time}")
    # if current_time:
    #     print(f"Operation End (Current): {actual_end_time}")
    
    # Use the most current time for the query to ensure we get real-time data
    cursor.execute(query, (unit_name, start_time, current_query_time))
    # print("\nQuery executed successfully with current time")
    
    results = []
    all_rows = cursor.fetchall()
    # print(f"\nFetched {len(all_rows)} rows from main query")
    
    for row in all_rows:
        # print(f"\nProcessing row: {row}")
        model_data = {
            'model': row[0],
            'success_qty': row[1],
            'fail_qty': row[2],
            'target': row[3],
            'total_qty': row[1] + row[2],
            'quality': row[1] / (row[1] + row[2]) if (row[1] + row[2]) > 0 else 0
        }
        
        if row[3]:  # If ModelSuresiSN exists
            ideal_cycle_time = 3600 / row[3]
            # Use actual_end_time (current time) instead of end_time for operation time calculation
            operation_time = (actual_end_time - start_time).total_seconds()
            model_data['performance'] = (model_data['total_qty'] * ideal_cycle_time) / operation_time if operation_time > 0 else 0
            model_data['oee'] = model_data['quality'] * model_data['performance']
            # print(f"Calculated metrics for {row[0]}:")
            # print(f"- Ideal cycle time: {ideal_cycle_time}")
            # print(f"- Operation time: {operation_time} seconds (using {'current time' if current_time else 'end time'})")
            # print(f"- Performance: {model_data['performance']}")
            # print(f"- OEE: {model_data['oee']}")
        else:
            model_data['performance'] = None
            model_data['oee'] = None
            # print(f"No target (ModelSuresiSN) for model {row[0]}, skipping performance calculation")
            
        results.append(model_data)
    
    cursor.close()
    conn.close()
    
    # print(f"\nReturning {len(results)} results")
    return results 