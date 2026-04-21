import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Manage user access, roles, and organization membership.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Active Users</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Coming soon.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Coming soon.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Coming soon.</CardContent>
        </Card>
      </div>
    </div>
  );
}
