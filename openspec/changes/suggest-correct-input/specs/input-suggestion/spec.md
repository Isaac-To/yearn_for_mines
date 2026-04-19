## ADDED Requirements

### Requirement: Closest Match Calculation
The system SHALL provide a function to calculate the closest matching strings from a given list of valid strings compared to an input string using a distance algorithm (e.g. Levenshtein).

#### Scenario: Similar string provided
- **WHEN** the input is "diamond" and the valid list contains "diamond_ore", "diamond_sword", "dirt"
- **THEN** the system returns "diamond_ore" and "diamond_sword" as the closest matches

#### Scenario: Exact match provided
- **WHEN** the input is "dirt" and the valid list contains "dirt"
- **THEN** the system returns an exact match

#### Scenario: No good match
- **WHEN** the input is completely unrelated to anything in the registry
- **THEN** the system may still return the closest technical matches, but handles the case gracefully
