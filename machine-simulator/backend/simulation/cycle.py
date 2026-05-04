from dataclasses import dataclass


IDLE = "IDLE"
HEATING = "HEATING"
QUENCH = "QUENCH"
DOWN = "DOWN"

IDLE_DURATION_S = 4
HEATING_DURATION_S = 8
QUENCH_DURATION_S = 6


@dataclass
class CycleState:
    state: str = IDLE
    elapsed_in_state: int = 0
    cycle_count: int = 0


class MachineCycle:
    """4-state cycle: IDLE -> HEATING -> QUENCH -> IDLE. DOWN is terminal."""

    def __init__(self) -> None:
        self.s = CycleState()

    def advance(self) -> CycleState:
        if self.s.state == DOWN:
            return self.s

        self.s.elapsed_in_state += 1

        if self.s.state == IDLE and self.s.elapsed_in_state >= IDLE_DURATION_S:
            self._transition(HEATING)
        elif self.s.state == HEATING and self.s.elapsed_in_state >= HEATING_DURATION_S:
            self._transition(QUENCH)
        elif self.s.state == QUENCH and self.s.elapsed_in_state >= QUENCH_DURATION_S:
            self.s.cycle_count += 1
            self._transition(IDLE)

        return self.s

    def fail(self) -> None:
        self._transition(DOWN)

    def reset(self) -> None:
        self.s = CycleState()

    def _transition(self, new_state: str) -> None:
        self.s.state = new_state
        self.s.elapsed_in_state = 0

    @property
    def state(self) -> str:
        return self.s.state

    @property
    def progress(self) -> float:
        if self.s.state == HEATING:
            denom = max(1, HEATING_DURATION_S - 1)
            return min(1.0, self.s.elapsed_in_state / denom)
        if self.s.state == QUENCH:
            denom = max(1, QUENCH_DURATION_S - 1)
            return min(1.0, self.s.elapsed_in_state / denom)
        return 0.0
