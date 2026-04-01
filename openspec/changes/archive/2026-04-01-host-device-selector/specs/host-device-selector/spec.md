## ADDED Requirements

### Requirement: In-app device selection for event host

The system SHALL provide in-app device selection controls for the host of a live event, allowing the host to switch between available microphones, cameras, and audio output devices without reloading the page or interrupting the LiveKit stream.

These controls SHALL be rendered exclusively for the host (the `isHost` prop is true in `HostControls`) and SHALL NOT appear for viewers or promoted participants.

---

### Requirement: DeviceSelector sub-component

A new `DeviceSelector` component SHALL be created inside `client/components/EventLiveRoom.js` as an internal sub-component. This component encapsulates the chevron button, the dropdown menu, and all device selection logic.

#### Props interface

```javascript
DeviceSelector({
  kind,        // Required. 'audioinput' | 'videoinput' | 'audiooutput'
  label,       // Optional. Displayed text next to the chevron when no dropdown is open.
                //          Defaults to the active device label if omitted.
})
```

#### Internal implementation

The component SHALL use the `useMediaDeviceSelect` hook from `@livekit/components-react`:

```javascript
import { useMediaDeviceSelect } from '@livekit/components-react'

const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
  kind,                       // Passed from props
  requestPermissions: true,   // Required for readable device labels
})
```

The hook is already available in the installed `@livekit/components-react` v2.9.20 package. No new dependencies are required.

#### Key behaviors provided by the hook

1. **Reactive enumeration:** The hook calls `navigator.mediaDevices.enumerateDevices()`, filters by `kind`, and re-renders automatically when the device list changes (USB hot-swap).
2. **Active device tracking:** `activeDeviceId` reflects the currently active device, synchronized with LiveKit's internal Room state.
3. **Safe switching:** `setActiveMediaDevice(deviceId)` internally calls `room.switchActiveDevice(kind, deviceId)` while managing React lifecycle (no setState on unmounted components, no memory leaks).
4. **Automatic cleanup:** On unmount, the hook removes all event listeners and cancels pending operations.

---

### Requirement: Chevron button

Each `DeviceSelector` SHALL render a small button with a downward-pointing chevron icon (SVG triangle or Heroicons `ChevronDownIcon`).

#### Scenario: Chevron placement for microphone
- **GIVEN** the host controls are rendered
- **WHEN** the microphone toggle switch is visible
- **THEN** a chevron button SHALL appear immediately to the right of the toggle switch
- **AND** the chevron SHALL be visually grouped with the toggle as part of the same control

#### Scenario: Chevron placement for camera
- **GIVEN** the host controls are rendered
- **WHEN** the camera toggle switch is visible
- **THEN** a chevron button SHALL appear immediately to the right of the toggle switch

#### Scenario: Chevron for audio output (no toggle)
- **GIVEN** the host controls are rendered
- **THEN** an "Altavoces" label SHALL appear with a chevron button
- **AND** there SHALL be NO toggle switch for audio output (audio output is always active)

#### Scenario: No chevron for screen share
- **GIVEN** the host controls are rendered
- **WHEN** the screen share toggle switch is visible
- **THEN** NO chevron or device selector SHALL appear next to it (the OS provides its own picker)

#### Scenario: Chevron visual styling
- **THEN** the chevron button SHALL use the following Tailwind classes (or equivalent):
  - Size: `h-4 w-4` for the SVG icon
  - Color: `text-gray-500` default, `hover:text-gray-700` on hover
  - Padding: `p-1` for click target
  - Cursor: `cursor-pointer`
  - Transition: `transition-transform` with `rotate-180` when dropdown is open

---

### Requirement: Device dropdown menu

When the chevron is clicked, a dropdown menu SHALL appear below the chevron button, listing all available devices for the corresponding `kind`.

#### Scenario: Opening the dropdown
- **GIVEN** the chevron button is visible
- **WHEN** the host clicks the chevron
- **THEN** a dropdown menu SHALL appear positioned below the button
- **AND** the dropdown SHALL use `position: absolute` relative to the button container
- **AND** the dropdown SHALL have `z-index: 10` (Tailwind `z-10`)

#### Scenario: Dropdown visual styling
- **THEN** the dropdown SHALL be styled as:
  - Background: `bg-white`
  - Border: `border border-gray-200`
  - Border radius: `rounded-lg`
  - Shadow: `shadow-lg`
  - Min width: `min-w-[200px]`
  - Max width: `max-w-[300px]`
  - Padding: `py-1`
  - Each device item: `px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer`
  - Overflow: `overflow-hidden` on text with `truncate` for long device names

#### Scenario: Device list rendering
- **GIVEN** the dropdown is open
- **THEN** each available device SHALL be rendered as a clickable item
- **AND** each item SHALL display `device.label` (the human-readable device name)
- **AND** if `device.label` is empty (permissions not granted), the system SHALL display a fallback: "Dispositivo {index + 1}"

#### Scenario: Active device indicator
- **GIVEN** the dropdown is open
- **THEN** the currently active device (matching `activeDeviceId`) SHALL be visually distinguished:
  - A check icon (SVG checkmark, `h-4 w-4 text-gray-900`) SHALL appear to the left of the device label
  - The device label text SHALL use `font-medium text-gray-900`
- **AND** inactive devices SHALL show:
  - An empty space (same width as the check icon) to the left, maintaining alignment
  - Label text in `text-gray-700` (default weight)

#### Scenario: Selecting a device
- **GIVEN** the dropdown is open and shows multiple devices
- **WHEN** the host clicks on a device item that is NOT the currently active device
- **THEN** `setActiveMediaDevice(device.deviceId)` SHALL be called
- **AND** the dropdown SHALL close immediately
- **AND** the active track (audio or video) SHALL switch to the selected device without page reload
- **AND** the LiveKit stream SHALL continue uninterrupted for all connected viewers

#### Scenario: Clicking the already-active device
- **GIVEN** the dropdown is open
- **WHEN** the host clicks on the device that is already active
- **THEN** the dropdown SHALL close
- **AND** no device switching SHALL occur

#### Scenario: Empty device list
- **GIVEN** the dropdown is open
- **AND** the `devices` array from the hook is empty (no hardware or permissions denied)
- **THEN** the dropdown SHALL display a single non-clickable item: "No se encontraron dispositivos"
- **AND** the text SHALL be styled as `text-sm text-gray-400 italic px-3 py-2`

---

### Requirement: Closing the dropdown

#### Scenario: Close on click outside
- **GIVEN** the dropdown is open
- **WHEN** the host clicks anywhere outside the dropdown and its chevron button
- **THEN** the dropdown SHALL close

**Implementation note:** Use a `useEffect` with a `mousedown` event listener on `document`. Check if the click target is outside the component's ref. Clean up the listener on unmount or when dropdown closes.

#### Scenario: Close on Escape key
- **GIVEN** the dropdown is open
- **WHEN** the host presses the Escape key
- **THEN** the dropdown SHALL close

#### Scenario: Close on device selection
- **GIVEN** the dropdown is open
- **WHEN** the host selects a device
- **THEN** the dropdown SHALL close (as specified in "Selecting a device" scenario)

#### Scenario: Only one dropdown open at a time
- **GIVEN** the microphone dropdown is open
- **WHEN** the host clicks the camera chevron
- **THEN** the microphone dropdown SHALL close
- **AND** the camera dropdown SHALL open

**Implementation note:** This can be achieved by lifting the "open dropdown kind" state to the `HostControls` parent, passing the open/close state down to each `DeviceSelector`.

---

### Requirement: Audio output selector (Altavoces)

#### Scenario: Audio output selector rendering
- **GIVEN** the host controls are rendered
- **AND** the browser supports audio output selection (`audiooutput` devices are available)
- **THEN** an "Altavoces" control SHALL appear in the controls bar
- **AND** it SHALL show ONLY a device selector (chevron + dropdown), NO toggle switch

#### Scenario: Audio output selector position
- **THEN** the "Altavoces" selector SHALL be positioned between the "Camara" control and the "Pantalla" control:
  ```
  Microfono [toggle] ▾ | Camara [toggle] ▾ | Altavoces ▾ | Pantalla [toggle]
  ```

#### Scenario: Audio output not supported by browser
- **GIVEN** the browser does NOT support `setSinkId` (older browsers)
- **AND** `useMediaDeviceSelect({ kind: 'audiooutput' })` returns an empty `devices` array
- **THEN** the "Altavoces" control SHALL NOT be rendered at all (graceful degradation)

---

### Requirement: Hot-swap device handling

#### Scenario: USB device connected during stream
- **GIVEN** the host is streaming
- **WHEN** a new USB camera/microphone is connected
- **THEN** the new device SHALL appear in the corresponding dropdown the next time it is opened
- **AND** the currently active device SHALL NOT change (no automatic switching)

#### Scenario: Active device disconnected during stream
- **GIVEN** the host is streaming with a specific device active
- **WHEN** that device is physically disconnected (USB removed)
- **THEN** LiveKit internally handles the fallback (typically reverts to system default)
- **AND** the dropdown SHALL update to reflect the new device list
- **AND** the `activeDeviceId` SHALL update to the new active device

#### Scenario: Device connected while dropdown is open
- **GIVEN** the dropdown is currently open
- **WHEN** a new device is connected
- **THEN** the dropdown list SHALL update in real-time to include the new device (the hook re-renders automatically via the `devicechange` event listener)

---

### Requirement: Error handling

#### Scenario: Device switch fails
- **GIVEN** the host selects a device from the dropdown
- **WHEN** the `setActiveMediaDevice()` call fails (device became unavailable, permission revoked)
- **THEN** the error SHALL be caught
- **AND** the existing `deviceError` state in `HostControls` SHALL be set with an appropriate message (e.g., "Error al cambiar el dispositivo")
- **AND** the dropdown SHALL close
- **AND** the previous device SHALL remain active (no partial state)

---

### Requirement: Integration with existing HostControls layout

The new selectors SHALL be integrated into the existing `HostControls` layout (lines 450-477 of `EventLiveRoom.js`).

#### Current layout structure (to be modified):
```jsx
<div className="flex items-center gap-x-6 flex-wrap">
  <div className="flex items-center gap-x-2">
    <span>Microfono</span>
    <ToggleSwitch />
  </div>
  <div className="flex items-center gap-x-2">
    <span>Camara</span>
    <ToggleSwitch />
  </div>
  <div className="flex items-center gap-x-2">
    <span>Pantalla</span>
    <ToggleSwitch />
  </div>
</div>
```

#### Target layout structure:
```jsx
<div className="flex items-center gap-x-6 flex-wrap">
  <div className="relative flex items-center gap-x-2">
    <span>Microfono</span>
    <ToggleSwitch />
    <DeviceSelector kind="audioinput" />
    {/* dropdown renders absolutely positioned below */}
  </div>
  <div className="relative flex items-center gap-x-2">
    <span>Camara</span>
    <ToggleSwitch />
    <DeviceSelector kind="videoinput" />
  </div>
  {/* Audio output: only selector, no toggle */}
  <div className="relative flex items-center gap-x-2">
    <span>Altavoces</span>
    <DeviceSelector kind="audiooutput" />
  </div>
  <div className="flex items-center gap-x-2">
    <span>Pantalla</span>
    <ToggleSwitch />
    {/* NO device selector */}
  </div>
</div>
```

Note: each container with a `DeviceSelector` MUST have `position: relative` (Tailwind `relative`) so the absolutely-positioned dropdown anchors correctly.

---

## LiveKit API Reference (for implementor)

### Import

```javascript
import { useMediaDeviceSelect } from '@livekit/components-react'
```

This export is already available in the installed `@livekit/components-react` v2.9.20. No additional packages needed.

### Hook signature

```javascript
useMediaDeviceSelect({
  kind: MediaDeviceKind,           // 'audioinput' | 'videoinput' | 'audiooutput'
  room?: Room,                     // Optional, auto-detected from LiveKitRoom context
  track?: LocalAudioTrack | LocalVideoTrack,  // Optional, for specific track targeting
  requestPermissions?: boolean,    // Default false. Set true for readable labels.
  onError?: (e: Error) => void,    // Optional error callback
})
```

### Return value

```javascript
{
  devices: MediaDeviceInfo[],       // Array of available devices
  activeDeviceId: string,           // Currently active device ID
  setActiveMediaDevice: (           // Switch to a different device
    deviceId: string,
    options?: { exact: boolean }    // Default { exact: true }
  ) => Promise<void>,
  className: string,                // CSS class (not used in custom UI)
}
```

### MediaDeviceInfo (Web API standard)

```javascript
{
  deviceId: string,    // Unique device identifier
  groupId: string,     // Hardware group ID
  kind: string,        // 'audioinput' | 'videoinput' | 'audiooutput'
  label: string,       // Human-readable name (empty if no permission)
}
```
