from voyager import Voyager

voyager = Voyager(
    mc_port=54321,
)

voyager.inference(
    sub_goals=[
        "Mine 4 wood logs",
        "Craft a crafting table",
    ],
)
