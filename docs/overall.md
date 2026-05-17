Current design

Imitating apple maps

Main view - Top is map, bottom is main drawer

# Map

- Go to user location button
- Fit current play area button
- Play area boundary overlay
- Selected hiding-zone transit overlays:
    - Train lines and stations for selected presets
    - Merged hiding-zone area around selected stations

# Main Drawer

- Questions
  Opens a stacked drawer
- Add Question
  Modal for question type (including paste), creates question, opens that question drawer
- Settings
  Opens settings drawer

## Question Drawer

Shows 1 questeion

# Settings drawer

- Play Area (OSM ID for outer bounding box, save this as polygon + bbox)
    - Outer bbox
- Hiding Zones
    - Radius from eligible train stations
    - Unit selector for mi/km/m, stored internally as meters
    - Suggested day-pass presets when the preset bbox intersects the play area
    - Tokyo Metro and Toei Subway presets sourced from processed ODPT GTFS data
- UI Settings
    - Thunderforest API Keys, etc
    - Default display units (mi, km, m. But default to meters internally)
- Hider mode on/off
- Copy / Paste state (Modal)

## Copy/paste Modal

Checkmark for what data to copy (Play area, UI settings, Questions) or paste.

# Wire Format

JSON with below

- Play Area
- Hiding Zones
- UI
- Question state
- New Question
    - This one is special, sent by seeker when asking question.
