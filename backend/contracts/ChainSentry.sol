// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ChainSentry
 * @notice Decentralized, tamper-evident evidence registry for the Chain Sentry
 *         surveillance network, deployed on the MST blockchain (EVM-compatible).
 *
 *         ONLY lightweight metadata and SHA-256 digests are stored on-chain.
 *         Raw video / frame packets remain off-chain in the evidence vault.
 */
contract ChainSentry {
    // ------------------------------------------------ types
    struct EvidenceRecord {
        string incidentId;
        string cameraId;
        bytes32 evidenceHash;
        uint64 timestamp;
        string eventType;
        address anchoredBy;
        VerificationStatus verification;
        bool exists;
    }

    struct Camera {
        string id;
        string location;
        bool registered;
        bool compromised;
        uint32 tamperCount;
        uint64 registeredAt;
    }

    enum VerificationStatus { None, Pending, Verified, Rejected }

    // ------------------------------------------------ state
    address public admin;
    mapping(address => bool) public verifiers;
    uint256 public verifierCount;

    mapping(string => Camera) public cameras;
    uint256 public cameraCount;

    mapping(string => EvidenceRecord) public evidence;      // incidentId => record
    mapping(bytes32 => string) public hashToIncident;       // evidenceHash => incidentId
    uint256 public incidentCount;

    mapping(string => bool) public tamperReported;          // incidentId => flagged

    struct Bounty { uint256 amount; string incidentId; bool open; }
    mapping(uint256 => Bounty) public bounties;
    uint256 public bountyCount;

    // ------------------------------------------------ events
    event CameraRegistered(string indexed cameraId, string location, uint64 at);
    event CameraTamper(string indexed cameraId, uint32 count, uint64 at);
    event VerifierRegistered(address indexed verifier, uint64 at);
    event IncidentCreated(string indexed incidentId, string cameraId, string eventType, uint64 at);
    event EvidenceAnchored(string indexed incidentId, string cameraId, bytes32 evidenceHash, uint64 timestamp, string eventType, address indexed by);
    event EvidenceVerified(string indexed incidentId, VerificationStatus status, address indexed verifier);
    event IncidentStatusUpdated(string indexed incidentId, string status, address indexed by);
    event BountyCreated(uint256 indexed bountyId, string incidentId, uint256 amount);

    // ------------------------------------------------ modifiers
    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }
    modifier onlyVerifier() { require(verifiers[msg.sender] || msg.sender == admin, "not verifier"); _; }

    constructor() { admin = msg.sender; verifiers[msg.sender] = true; verifierCount = 1; }

    // ------------------------------------------------ registry
    function registerCamera(string calldata id, string calldata location) external onlyAdmin {
        require(!cameras[id].registered, "camera exists");
        cameras[id] = Camera(id, location, true, false, 0, uint64(block.timestamp));
        cameraCount++;
        emit CameraRegistered(id, location, uint64(block.timestamp));
    }

    function registerVerifier(address v) external onlyAdmin {
        require(!verifiers[v], "already verifier");
        verifiers[v] = true;
        verifierCount++;
        emit VerifierRegistered(v, uint64(block.timestamp));
    }

    function recordCameraTamper(string calldata cameraId) external {
        require(cameras[cameraId].registered, "unknown camera");
        cameras[cameraId].tamperCount++;
        cameras[cameraId].compromised = true;
        emit CameraTamper(cameraId, cameras[cameraId].tamperCount, uint64(block.timestamp));
    }

    // ------------------------------------------------ incidents & evidence
    function createIncident(string calldata incidentId, string calldata cameraId, string calldata eventType) external {
        require(cameras[cameraId].registered, "unknown camera");
        emit IncidentCreated(incidentId, cameraId, eventType, uint64(block.timestamp));
    }

    /// @notice Anchor a piece of evidence: this is the primary entry point.
    function anchorEvidence(
        string calldata incidentId,
        string calldata cameraId,
        string calldata evidenceHash,
        uint64 timestamp,
        string calldata eventType
    ) external returns (bytes32) {
        bytes32 h = _toBytes32(evidenceHash);
        require(h != bytes32(0), "empty hash");
        require(!evidence[incidentId].exists, "already anchored");

        evidence[incidentId] = EvidenceRecord({
            incidentId: incidentId,
            cameraId: cameraId,
            evidenceHash: h,
            timestamp: timestamp,
            eventType: eventType,
            anchoredBy: msg.sender,
            verification: VerificationStatus.Pending,
            exists: true
        });
        hashToIncident[h] = incidentId;
        incidentCount++;
        emit EvidenceAnchored(incidentId, cameraId, h, timestamp, eventType, msg.sender);
        return h;
    }

    function verifyEvidence(string calldata incidentId, bool confirmed) public onlyVerifier {
        EvidenceRecord storage rec = evidence[incidentId];
        require(rec.exists, "no such evidence");
        rec.verification = confirmed ? VerificationStatus.Verified : VerificationStatus.Rejected;
        emit EvidenceVerified(incidentId, rec.verification, msg.sender);
    }

    function recordVerification(
        string calldata incidentId,
        uint8 visionConf, uint8 behaviorConf, uint8 contextConf
    ) external onlyVerifier {
        // confidences in percent (0-100); majority >= 60% confirms
        uint8 votes = (visionConf >= 60 ? 1 : 0) + (behaviorConf >= 60 ? 1 : 0) + (contextConf >= 60 ? 1 : 0);
        verifyEvidence(incidentId, votes >= 2);
    }

    function updateIncidentStatus(string calldata incidentId, string calldata status) external {
        require(evidence[incidentId].exists, "no such evidence");
        emit IncidentStatusUpdated(incidentId, status, msg.sender);
    }

    // ------------------------------------------------ bounties
    function createSecurityBounty(string calldata incidentId) external payable {
        require(msg.value > 0, "fund the bounty");
        bounties[bountyCount] = Bounty(msg.value, incidentId, true);
        emit BountyCreated(bountyCount, incidentId, msg.value);
        bountyCount++;
    }

    // ------------------------------------------------ helpers
    function _toBytes32(string calldata hexHash) private pure returns (bytes32) {
        bytes memory b = bytes(hexHash);
        if (b.length == 66 && b[0] == "0" && b[1] == "x") {
            bytes memory raw = new bytes(64);
            for (uint256 i = 0; i < 64; i++) raw[i] = b[i + 2];
            return _parseHex(raw);
        }
        if (b.length == 64) return _parseHex(b);
        return bytes32(0);
    }

    function _parseHex(bytes memory b) private pure returns (bytes32) {
        require(b.length == 64, "bad hash len");
        bytes32 out;
        for (uint256 i = 0; i < 32; i++) {
            out |= bytes32((uint256(uint8(_hexVal(b[i * 2]))) << 4 | uint8(_hexVal(b[i * 2 + 1]))) << ((31 - i) * 8));
        }
        return out;
    }

    function _hexVal(bytes1 c) private pure returns (uint8) {
        if (c >= "0" && c <= "9") return uint8(c) - 48;
        if (c >= "a" && c <= "f") return uint8(c) - 87;
        if (c >= "A" && c <= "F") return uint8(c) - 55;
        revert("bad hex");
    }

    function isTamperReported(string calldata incidentId) external view returns (bool) {
        return tamperReported[incidentId];
    }
}
