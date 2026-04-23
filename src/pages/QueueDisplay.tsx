import { useParams } from "react-router-dom";

export default function QueueDisplay() {
  const { displayToken } = useParams();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold mb-4">Queue Display</h1>
      <p className="text-xl text-muted-foreground">Coming Soon</p>
      {displayToken && (
        <p className="mt-6 text-xs text-muted-foreground">Display: {displayToken}</p>
      )}
    </div>
  );
}
