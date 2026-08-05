# CallPub

CallPub is a lightweight browser-based collaboration room for quick calls, screen sharing, and visual discussion.
It is built for moments when people need to meet, explain something, sketch ideas, point at details, and keep a shared board in the same link.

## Key Features

### Rooms and Presence

- Shareable room links for quick access.
- Custom display name before joining a room.
- Display name saved between browser sessions.
- Participant list with live connection status.
- Automatic cleanup of inactive participants after reloads or connection loss.
- Separate actions for creating a new room link and clearing the current board.

### Calls

- Audio calls.
- Video calls.
- Screen sharing.
- Microphone mute.
- Camera toggle.
- Compact device menus for microphone, camera, and speaker selection.
- Expanded view for video and screen sharing.
- Fullscreen mode for shared screen or video.

### Whiteboard

- Shared online whiteboard synchronized between participants.
- Pen and eraser tools.
- Lines, arrows, rectangles, and circles.
- Arrow submenu for line drawing.
- Color picker popover.
- Stroke width popover.
- Board panning.
- Board zooming.
- Undo.
- Clear board.
- PNG export.
- Per-room board state saved in the browser.

### Objects

- Editable text objects.
- Movable and resizable text.
- Movable and resizable shapes.
- Image insertion from clipboard.
- Image upload from device.
- Drag-and-drop image insertion.
- Movable and resizable image objects.
- Object context menu for arrangement:
  - bring to front;
  - bring forward;
  - send backward;
  - send to back.

### Collaboration Tools

- Remote participant cursors on the board.
- Pointer tool with animated attention rings.
- Shared board updates in real time.

### Interface

- Compact toolbar inspired by common online whiteboards.
- Dedicated desktop, tablet, and mobile layouts.
- Custom app icon.
- Favicon.
- Board loading screen.

## Notes

CallPub runs directly in the browser and uses WebRTC/PeerJS for peer-to-peer communication.
Board data is stored locally per room in the browser, so a new room link and a new blank board are intentionally different actions.
