// Keyboard and mouse input: the held keys each frame, plus the edge-triggered
// actions (confirm, pause, interact, punch, mute) and the mouse position for aiming.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, clicked: false, down: false };

  function isMoveKey(code) {
    return code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD'
      || code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight';
  }

  function onKeyDown(event) {
    if (isMoveKey(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.code === 'Space' || event.code === 'Enter') { actions |= ACTION_CONFIRM; event.preventDefault(); }
    else if (event.code === 'Escape' || event.code === 'KeyP') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_INTERACT;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
    mouse.clicked = true;
  }

  function onMouseUp() { mouse.down = false; }

  function onBlur() { held.clear(); mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      return { x, y };
    },
    isRunning() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return clicked;
    },
  };
}
