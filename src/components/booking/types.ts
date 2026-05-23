export interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  hospitalId: string;
  mode: "registrar" | "inpatient";
  hospitalizationId?: string;
  preselectedServiceId?: string;
  existingVisitServiceId?: string;
  initialPhysician?: PhysicianResult | null;
  initialService?: ServiceResult | null;
  initialOfficeRoom?: OfficeRoomResult | null;
  onBooked: (result: BookingResult) => void;
}

export interface BookingResult {
  visitServiceId: string;
  slotId?: string;
  scheduledAt?: string;
  queueNumber?: number;
  isWaitlist?: boolean;
  serviceId: string;
  physicianId?: string;
  officeRoomId?: string;
}

export interface PhysicianResult {
  id: string;
  fullName: string;
  specialization: string | null; // keep for display,
  // now sourced from specializations join
  scheduleType: "slots" | "queue" | null;
}

export interface ServiceResult {
  id: string;
  name: string;
  costWithVat: number;
  serviceTypeName: string | null;
}

export interface OfficeRoomResult {
  id: string;
  name: string;
  service: ServiceResult;
}

export interface SlotRow {
  id: string;
  slot_datetime: string;
  booking_count: number;
  is_blocked: boolean;
  block_reason: string | null;
}
