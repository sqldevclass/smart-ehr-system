import DocumentWorkspace from "./DocumentWorkspace";

interface Props {
  hospitalizationId: string;
  existingDocumentId?: string;
  documentTypeId: string;
  patientId: string;
  hospitalId: string;
  onClose: () => void;
  onDocumentCreated?: (documentId: string) => void;
}

export default function InpatientDocumentWorkspace(props: Props) {
  const extra: any = {
    visitServiceId: undefined,
    patientId: props.patientId,
    visitId: "",
    hospitalId: props.hospitalId,
    documentTypeId: props.documentTypeId,
    hospitalizationId: props.hospitalizationId,
    existingDocumentId: props.existingDocumentId,
    serviceStatusCode: "ready_for_execution",
    onClose: props.onClose,
    onDocumentCreated: props.onDocumentCreated,
  };
  return <DocumentWorkspace {...extra} />;
}
