import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InpatientProfile() {
  const { user } = useAuth();

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span className="text-muted-foreground">Name:</span> {user?.fullName}</p>
        <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
        <p><span className="text-muted-foreground">Role:</span> {user?.roles.join(", ")}</p>
        <p><span className="text-muted-foreground">Hospital:</span> {user?.hospitalName}</p>
      </CardContent>
    </Card>
  );
}
