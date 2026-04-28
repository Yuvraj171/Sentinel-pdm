
import sys
import os
import asyncio
import threading
import signal

# Add current directory to path
sys.path.append(os.getcwd())

print("🚀 INITIALIZING STANDALONE SIMULATOR...")

try:
    from backend.state import active_machine, persistence_layer
    from backend.routers.simulation import run_live_simulation_thread
except ImportError as e:
    print(f"❌ Error: Could not import backend modules. Make sure you are in the 'Machine-Simulator' root directory.")
    print(f"Details: {e}")
    sys.exit(1)

async def main():
    print("🔋 STARTING DB WORKER (ASYNC)...")
    # Start the background worker that writes to SQLite
    worker_task = asyncio.create_task(persistence_layer.start_worker())
    
    print("🚦 STARTING MACHINE CYCLE...")
    active_machine.start_cycle()
    
    print("⚙️ LAUNCHING SIMULATION THREAD...")
    # Run the physics loop in a separate thread (Non-Blocking to Event Loop)
    sim_thread = threading.Thread(target=run_live_simulation_thread, daemon=True)
    sim_thread.start()
    
    print("\n✅ SIMULATOR RUNNING! (Ctrl+C to Stop)")
    print(f"   Machine State: {active_machine.state}")
    print(f"   Writing to:    {persistence_layer.db_path or 'Default DB'}")
    
    try:
        # Keep the main async loop alive to handle DB writes
        while sim_thread.is_alive():
            await asyncio.sleep(1)
            
    except asyncio.CancelledError:
        print("\n🛑 Async Loop Cancelled")
        
    finally:
        print("\n🛑 SHUTTING DOWN...")
        active_machine.stop()
        await persistence_layer.stop_worker()
        print("✅ Shutdown Complete.")

if __name__ == "__main__":
    try:
        # Run the async main loop
        asyncio.run(main())
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully
        pass
