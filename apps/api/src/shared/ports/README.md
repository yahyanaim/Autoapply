# Ports

Interface definitions implemented by infrastructure adapters across modules
(HQSE black-box principle, Spec section 2.3): StoragePort, PaymentsPort, ClockPort,
QueuePort, AIProviderPort. Domain/application code depends on these interfaces
only -- never on a concrete SDK.
