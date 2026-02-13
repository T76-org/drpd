/**
 * @file sink_context.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <functional>
#include <optional>
#include <set>
#include <span>
#include <vector>

#include "message_sender.hpp"
#include "sink_runtime_state.hpp"
#include "sink_types.hpp"

#include "../../phy/bmc_decoder.hpp"
#include "../../phy/bmc_encoder.hpp"
#include "../../proto/pd_message_types.hpp"
#include "../../proto/pd_messages/epr_mode.hpp"
#include "../../proto/pd_messages/epr_source_capabilities.hpp"
#include "../../proto/pd_messages/source_capabilities.hpp"


namespace T76::DRPD::Logic {

    class CCBusController;
    enum class CCBusState : uint32_t;

    class DisconnectedStateHandler;
    class EPRKeepaliveStateHandler;
    class EPRModeEntryStateHandler;
    class ReadySinkStateHandler;
    class SelectCapabilityStateHandler;
    class TransitionSinkStateHandler;
    class WaitForCapabilitiesStateHandler;

    class SinkContext {
    public:
        SinkContext(
            SinkRuntimeState& runtimeState,
            SinkMessageSender& messageSender,
            CCBusController& ccBusController,
            DisconnectedStateHandler& disconnectedStateHandler,
            EPRKeepaliveStateHandler& eprKeepaliveStateHandler,
            EPRModeEntryStateHandler& eprModeEntryStateHandler,
            ReadySinkStateHandler& readySinkStateHandler,
            SelectCapabilityStateHandler& selectCapabilityStateHandler,
            TransitionSinkStateHandler& transitionSinkStateHandler,
            WaitForCapabilitiesStateHandler& waitForCapabilitiesStateHandler,
            std::function<void(SinkInfoChange)>& sinkInfoChangedCallback);

        SinkRuntimeState& runtimeState();
        const SinkRuntimeState& runtimeState() const;

        void transitionTo(SinkState state);
        void performReset(SinkResetType resetType);

        void setSourceCapabilities(const Proto::SourceCapabilities& sourceCapabilities);
        void setEPRSourceCapabilities(const Proto::EPRSourceCapabilities& sourceCapabilities);
        void clearEPRSourceCapabilities();
        void setNegotiatedValues(const Proto::PDOVariant pdoVariant, float voltage, float current);
        void setEPRModeActive(bool active);

        size_t totalPDOCount() const;
        std::optional<Proto::PDOVariant> pdoAtIndex(size_t index) const;
        std::optional<uint8_t> requestObjectPositionAtIndex(size_t index) const;
        std::optional<std::vector<uint8_t>> takeCompletedExtendedPayload(Proto::ExtendedMessageType type);

        void sendNotSupportedMessage();
        void sendEPRMode(Proto::EPRMode::Action action, uint8_t data = 0);
        void sendExtendedControlMessage(uint8_t controlType, bool awaitGoodCRC = true);
        void sendMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message);
        bool requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA);

    protected:
        SinkRuntimeState& _runtimeState;
        SinkMessageSender& _messageSender;
        CCBusController& _ccBusController;

        DisconnectedStateHandler& _disconnectedStateHandler;
        EPRKeepaliveStateHandler& _eprKeepaliveStateHandler;
        EPRModeEntryStateHandler& _eprModeEntryStateHandler;
        ReadySinkStateHandler& _readySinkStateHandler;
        SelectCapabilityStateHandler& _selectCapabilityStateHandler;
        TransitionSinkStateHandler& _transitionSinkStateHandler;
        WaitForCapabilitiesStateHandler& _waitForCapabilitiesStateHandler;

        std::function<void(SinkInfoChange)>& _sinkInfoChangedCallback;

        bool _sourceEPRCapable() const;
        void _notifySinkInfoChanged(SinkInfoChange change);
    };

} // namespace T76::DRPD::Logic
