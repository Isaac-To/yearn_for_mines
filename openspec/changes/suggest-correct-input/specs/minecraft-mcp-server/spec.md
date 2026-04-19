## MODIFIED Requirements

### Requirement: Tool Error Handling
The MCP server SHALL return clear error messages when tool inputs are invalid, specifically catching Minecraft registry validation errors. Error messages MUST NOT throw exceptions that crash the server, but instead return formatted error objects with `isError: true`.

#### Scenario: Invalid item name provided
- **WHEN** an agent provides an invalid item name to a tool like `gather_materials` (e.g., "diamond")
- **THEN** the server catches the invalid name error
- **THEN** the server computes the closest valid item names using the `input-suggestion` capability
- **THEN** the server returns an error message formatted as "Unknown block type: 'diamond'. Did you mean 'diamond_ore', 'diamond_block'?" with `isError: true`

#### Scenario: Tool execution exception
- **WHEN** a tool execution fails for any other reason
- **THEN** the server catches the exception and returns the error message as content with `isError: true`
