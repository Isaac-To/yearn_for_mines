#!/usr/bin/env python3
"""Streamable HTTP wrapper for the MemPalace MCP server.

MemPalace's built-in MCP server only supports stdio transport.
This script wraps it with the MCP Python SDK's FastMCP to serve
over Streamable HTTP on port 8080, matching the protocol expected
by the yearn-for-mines agent.
"""

import json
import os
import mempalace.mcp_server as mp
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "mempalace",
    host=os.environ.get("MEMPALACE_HOST", "0.0.0.0"),
    port=int(os.environ.get("MEMPALACE_PORT", "8080")),
    stateless_http=True,
    json_response=True,
)


def _s(result) -> str:
    """Serialize mempalace tool results — dicts become JSON, strings pass through."""
    return json.dumps(result, indent=2) if isinstance(result, dict) else str(result)


# ─── Read tools ──────────────────────────────────────────────

@mcp.tool()
def mempalace_status() -> str:
    """Palace overview — total drawers, wing and room counts."""
    return _s(mp.tool_status())


@mcp.tool()
def mempalace_list_wings() -> str:
    """List all wings with drawer counts."""
    return _s(mp.tool_list_wings())


@mcp.tool()
def mempalace_list_rooms(wing: str | None = None) -> str:
    """List rooms within a wing (or all rooms if no wing given)."""
    return _s(mp.tool_list_rooms(wing=wing))


@mcp.tool()
def mempalace_get_taxonomy() -> str:
    """Full taxonomy: wing → room → drawer count."""
    return _s(mp.tool_get_taxonomy())


@mcp.tool()
def mempalace_get_aaak_spec() -> str:
    """Get the AAAK dialect specification — the compressed memory format MemPalace uses."""
    return _s(mp.tool_get_aaak_spec())


# ─── Search ─────────────────────────────────────────────────

@mcp.tool()
def mempalace_search(
    query: str,
    limit: int = 5,
    wing: str | None = None,
    room: str | None = None,
    max_distance: float = 1.5,
    context: str | None = None,
) -> str:
    """Semantic search. Returns verbatim drawer content with similarity scores."""
    return _s(mp.tool_search(
        query=query, limit=limit, wing=wing, room=room,
        max_distance=max_distance, context=context,
    ))


@mcp.tool()
def mempalace_check_duplicate(content: str, threshold: float = 0.9) -> str:
    """Check if content already exists in the palace before filing."""
    return _s(mp.tool_check_duplicate(content=content, threshold=threshold))


# ─── Write tools ─────────────────────────────────────────────

@mcp.tool()
def mempalace_add_drawer(
    wing: str,
    room: str,
    content: str,
    source_file: str | None = None,
    added_by: str = "mcp",
) -> str:
    """File verbatim content into the palace. Checks for duplicates first."""
    return _s(mp.tool_add_drawer(wing=wing, room=room, content=content,
                                 source_file=source_file, added_by=added_by))


@mcp.tool()
def mempalace_delete_drawer(drawer_id: str) -> str:
    """Delete a drawer by ID. Irreversible."""
    return _s(mp.tool_delete_drawer(drawer_id=drawer_id))


@mcp.tool()
def mempalace_get_drawer(drawer_id: str) -> str:
    """Fetch a single drawer by ID — returns full content and metadata."""
    return _s(mp.tool_get_drawer(drawer_id=drawer_id))


@mcp.tool()
def mempalace_list_drawers(
    wing: str | None = None,
    room: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> str:
    """List drawers with pagination. Optional wing/room filter."""
    return _s(mp.tool_list_drawers(wing=wing, room=room, limit=limit, offset=offset))


@mcp.tool()
def mempalace_update_drawer(
    drawer_id: str,
    content: str | None = None,
    wing: str | None = None,
    room: str | None = None,
) -> str:
    """Update an existing drawer's content and/or metadata."""
    return _s(mp.tool_update_drawer(drawer_id=drawer_id, content=content, wing=wing, room=room))


# ─── Knowledge graph ─────────────────────────────────────────

@mcp.tool()
def mempalace_kg_query(
    entity: str,
    as_of: str | None = None,
    direction: str = "both",
) -> str:
    """Query the knowledge graph for an entity's relationships."""
    return _s(mp.tool_kg_query(entity=entity, as_of=as_of, direction=direction))


@mcp.tool()
def mempalace_kg_add(
    subject: str,
    predicate: str,
    object: str,
    valid_from: str | None = None,
    source_closet: str | None = None,
) -> str:
    """Add a fact to the knowledge graph."""
    return _s(mp.tool_kg_add(subject=subject, predicate=predicate, object=object,
                             valid_from=valid_from, source_closet=source_closet))


@mcp.tool()
def mempalace_kg_invalidate(
    subject: str,
    predicate: str,
    object: str,
    ended: str | None = None,
) -> str:
    """Mark a fact as no longer true."""
    return _s(mp.tool_kg_invalidate(subject=subject, predicate=predicate,
                                     object=object, ended=ended))


@mcp.tool()
def mempalace_kg_timeline(entity: str | None = None) -> str:
    """Chronological timeline of facts for an entity."""
    return _s(mp.tool_kg_timeline(entity=entity))


@mcp.tool()
def mempalace_kg_stats() -> str:
    """Knowledge graph overview: entities, triples, current vs expired facts."""
    return _s(mp.tool_kg_stats())


# ─── Graph traversal ──────────────────────────────────────────

@mcp.tool()
def mempalace_traverse(start_room: str, max_hops: int = 2) -> str:
    """Walk the palace graph from a room. Shows connected ideas across wings."""
    return _s(mp.tool_traverse(start_room=start_room, max_hops=max_hops))


@mcp.tool()
def mempalace_find_tunnels(
    wing_a: str | None = None,
    wing_b: str | None = None,
) -> str:
    """Find rooms that bridge two wings — the hallways connecting different domains."""
    return _s(mp.tool_find_tunnels(wing_a=wing_a, wing_b=wing_b))


@mcp.tool()
def mempalace_graph_stats() -> str:
    """Palace graph overview: total rooms, tunnel connections, edges between wings."""
    return _s(mp.tool_graph_stats())


@mcp.tool()
def mempalace_create_tunnel(
    source_wing: str,
    source_room: str,
    target_wing: str,
    target_room: str,
    label: str = "",
    source_drawer_id: str | None = None,
    target_drawer_id: str | None = None,
) -> str:
    """Create a cross-wing tunnel linking two palace locations."""
    return _s(mp.tool_create_tunnel(
        source_wing=source_wing, source_room=source_room,
        target_wing=target_wing, target_room=target_room,
        label=label, source_drawer_id=source_drawer_id,
        target_drawer_id=target_drawer_id,
    ))


@mcp.tool()
def mempalace_list_tunnels(wing: str | None = None) -> str:
    """List all explicit cross-wing tunnels. Optionally filter by wing."""
    return _s(mp.tool_list_tunnels(wing=wing))


@mcp.tool()
def mempalace_delete_tunnel(tunnel_id: str) -> str:
    """Delete an explicit tunnel by its ID."""
    return _s(mp.tool_delete_tunnel(tunnel_id=tunnel_id))


@mcp.tool()
def mempalace_follow_tunnels(wing: str, room: str) -> str:
    """Follow tunnels from a room to see what it connects to in other wings."""
    return _s(mp.tool_follow_tunnels(wing=wing, room=room))


# ─── Diary ──────────────────────────────────────────────────

@mcp.tool()
def mempalace_diary_write(agent_name: str, entry: str, topic: str = "general") -> str:
    """Write to your personal agent diary in AAAK format."""
    return _s(mp.tool_diary_write(agent_name=agent_name, entry=entry, topic=topic))


@mcp.tool()
def mempalace_diary_read(agent_name: str, last_n: int = 10) -> str:
    """Read your recent diary entries (in AAAK)."""
    return _s(mp.tool_diary_read(agent_name=agent_name, last_n=last_n))


# ─── Maintenance ─────────────────────────────────────────────

@mcp.tool()
def mempalace_hook_settings(
    silent_save: bool | None = None,
    desktop_toast: bool | None = None,
) -> str:
    """Get or set hook behavior settings."""
    return _s(mp.tool_hook_settings(silent_save=silent_save, desktop_toast=desktop_toast))


@mcp.tool()
def mempalace_memories_filed_away() -> str:
    """Acknowledge the latest silent checkpoint. Returns a short summary."""
    return _s(mp.tool_memories_filed_away())


@mcp.tool()
def mempalace_reconnect() -> str:
    """Force reconnect to the palace database."""
    return _s(mp.tool_reconnect())


if __name__ == "__main__":
    mcp.run(transport="streamable-http")