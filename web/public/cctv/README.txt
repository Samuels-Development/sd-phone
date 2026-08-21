Curated camera stills.

Drop a JPG in here named after a camera id from configs/cctv.lua, for example:

    fleeca_legion_square.jpg
    ammunation_1.jpg

and the CCTV grid uses it instead of the frame it captured itself. Around 448x320
is plenty; anything wider is scaled down.

Why both exist: the grid captures a real frame the first time an officer opens a
camera, so it is never empty, but a still grabbed at 3am in the rain is not a nice
picture. A file dropped here always wins, so a curated shot can replace a captured
one without touching any code.
