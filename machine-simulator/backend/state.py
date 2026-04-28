from backend.simulation.machine import MachineState
from backend.simulation.persistence import SimulationPersistence

# Global Singleton State
# This ensures that both the Live Simulation Thread and Fast Forward logic
# interact with the SAME machine instance.
active_machine = MachineState()
persistence_layer = SimulationPersistence()

# Link persistence
active_machine.persistence = persistence_layer
