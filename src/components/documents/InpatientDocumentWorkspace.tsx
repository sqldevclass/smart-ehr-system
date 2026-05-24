import DocumentWorkspace from "./DocumentWorkspace";

interface Props {
  hospitalizationId: string;
  documentId: string | null;
  documentTypeId: string;
  patientId: string;
  hospitalId: string;
  onClose: () => void;
}

export default function InpatientDocumentWorkspace(props: Props) {
  const extra: any = {
    visitServiceId: "",
    patientId: props.patientId,
    visitId: "",
    hospitalId: props.hospitalId,
    documentTypeId: props.documentTypeId,
    hospitalizationId: props.hospitalizationId,
    serviceStatusCode: "ready_for_execution",
    onClose: props.onClose,
  };
  return <DocumentWorkspace {...extra} />;
}
