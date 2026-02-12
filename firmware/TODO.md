- [ ] **Trigger**
    - [ ] Add filtering by actor
    - [ ] Add filtering by message type
    - [ ] Add filtering by message ID

- [ ] **Sink support**
    - [ ] When requesting invalid parameters, signal an error instead of silently ignoring
    - [ ] Implement the state machine without using friend classes

- [ ] **Test suite**
    - [ ] Pick a test unit suite and implement it

- [ ] **Misc**
    - [ ] Remove source support
    - [ ] Stabilize analog monitor readings (wait until next hardware revision)
    - [ ] Add timestamps to analog readings
    - [ ] Validate SCPI error codes across the board
    - [ ] Maximize memory depth for captures

- [ ] **Ideas**
    - [ ] Add ability to simply test cable e-markers for capabilities
    - [ ] Add support for a “report” mode that summarizes a source's information
    - [ ] Add/document a “custom mode” to allow extending DrPD with user-defined behaviors
    - [ ] Allow modifying most internal device settings (e.g.: thresholds, timings, etc.) via SCPI commands

- [ ] **Bugs**
    - [ ] In Sink mode, capture should be on by default, or at least we need a mechanism to turn it on for the Sink object but not send captures to the host
    - [ ] There seems to be a _negative_ offset in the voltage readings, investigate and fix
