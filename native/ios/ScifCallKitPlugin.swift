import Foundation
import Capacitor
import CallKit
import PushKit

/**
 * Integration scaffold, not a standalone Swift package. Add this file to the generated
 * iOS app target, register the plugin with Capacitor, configure APNs VoIP entitlements,
 * and test on physical devices. CallKit UI does not provide encrypted media/signaling.
 */
@objc(ScifCallKitPlugin)
public class ScifCallKitPlugin: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "ScifCallKitPlugin"
    public let jsName = "ScifCallKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "registerVoipPush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "answerCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise)
    ]

    private var registry: PKPushRegistry?
    private var provider: CXProvider?
    private var calls: [String: UUID] = [:]

    override public func load() {
        let configuration = CXProviderConfiguration(localizedName: "SCIF")
        configuration.supportsVideo = true
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        provider = CXProvider(configuration: configuration)
        provider?.setDelegate(self, queue: nil)
    }

    @objc public func registerVoipPush(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let registry = PKPushRegistry(queue: .main)
            registry.delegate = self
            registry.desiredPushTypes = [.voIP]
            self.registry = registry
            call.resolve()
        }
    }

    public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        notifyListeners("voipToken", data: ["token": token])
        // Upload token only to an authenticated backend over TLS. Never log it.
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        notifyListeners("voipTokenInvalidated", data: [:])
    }

    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let body = payload.dictionaryPayload
        guard let callId = body["call_id"] as? String,
              let uuid = UUID(uuidString: callId) else { completion(); return }
        let caller = (body["caller_name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Private caller"
        calls[callId] = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: caller)
        update.localizedCallerName = caller
        update.hasVideo = (body["has_video"] as? Bool) ?? false
        provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if error == nil {
                self?.notifyListeners("incomingCall", data: ["callId": callId, "callerName": caller])
            }
            completion()
        }
    }

    @objc public func answerCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"), let uuid = calls[callId] else {
            call.reject("Unknown call")
            return
        }
        let action = CXAnswerCallAction(call: uuid)
        let controller = CXCallController()
        controller.request(CXTransaction(action: action)) { error in
            if let error = error { call.reject("Could not answer call", nil, error) }
            else { call.resolve() }
        }
    }

    @objc public func endCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"), let uuid = calls[callId] else {
            call.reject("Unknown call")
            return
        }
        let controller = CXCallController()
        controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) { error in
            if let error = error { call.reject("Could not end call", nil, error) }
            else { call.resolve() }
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // TODO: authenticate and establish encrypted call media before fulfilling.
        notifyListeners("callAnswered", data: ["callId": action.callUUID.uuidString])
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        notifyListeners("callEnded", data: ["callId": action.callUUID.uuidString])
        action.fulfill()
    }

    public func providerDidReset(_ provider: CXProvider) {
        calls.removeAll()
    }
}
