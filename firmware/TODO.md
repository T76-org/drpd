- [ ] **Trigger**
    - [ ] Add filtering by actor
    - [ ] Add filtering by message type
    - [ ] Add filtering by message ID

- [ ] **Sink support**
    - [ ] When requesting invalid parameters, signal an error instead of silently ignoring

- [ ] **Test suite**
    - [ ] Pick a test unit suite and implement it

- [ ] **Misc**
    - [ ] Remove source support
    - [ ] Stabilize analog monitor readings (wait until next hardware revision)
    - [ ] Validate SCPI error codes across the board

- [ ] **Ideas**
    - [ ] Add ability to simply test cable e-markers for capabilities
    - [ ] Add support for a “report” mode that summarizes a source's information
    - [ ] Add/document a “custom mode” to allow extending DrPD with user-defined behaviors
    - [ ] Allow modifying most internal device settings (e.g.: thresholds, timings, etc.) via SCPI commands

- [ ] **Bugs**
    - [ ] Fix timestamp tracking in message receiver (this needs to be done by tracking the timing of each pulse)
