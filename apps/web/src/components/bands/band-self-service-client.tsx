"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BandSelfServiceClient() {
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const updateProfile = useMutation(api.users.updateActiveBandProfile);
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [performerRateUsd, setPerformerRateUsd] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"org_admin" | "org_member">("org_member");
  const [message, setMessage] = useState<string | null>(null);

  async function saveProfile() {
    await updateProfile({
      displayName: displayName || profile?.displayName,
      bio: bio || profile?.bio,
      performerHourlyRateUsd:
        performerRateUsd.trim().length > 0
          ? Number(performerRateUsd)
          : profile?.performerHourlyRateUsd,
      publicWebsiteUrl: website || profile?.publicWebsiteUrl,
      publicInstagramUrl: instagram || profile?.publicInstagramUrl,
      publicYoutubeUrl: youtube || profile?.publicYoutubeUrl,
    });
    setMessage("Band profile updated.");
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    await inviteMember({
      email: inviteEmail.trim(),
      role: inviteRole,
    });
    setInviteEmail("");
    setMessage("Band member invite sent.");
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-primary">{message}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Band Public Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Display Name</Label>
            <Input
              value={displayName || profile?.displayName || ""}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Bio</Label>
            <textarea
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={bio || profile?.bio || ""}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              placeholder="Performer hourly rate (USD)"
              inputMode="decimal"
              value={performerRateUsd || String(profile?.performerHourlyRateUsd ?? 0)}
              onChange={(e) => setPerformerRateUsd(e.target.value)}
            />
            <Input
              placeholder="Website"
              value={website || profile?.publicWebsiteUrl || ""}
              onChange={(e) => setWebsite(e.target.value)}
            />
            <Input
              placeholder="Instagram URL"
              value={instagram || profile?.publicInstagramUrl || ""}
              onChange={(e) => setInstagram(e.target.value)}
            />
            <Input
              placeholder="YouTube URL"
              value={youtube || profile?.publicYoutubeUrl || ""}
              onChange={(e) => setYoutube(e.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void saveProfile()}>
            Save Band Profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Band Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
            <Input
              placeholder="Invite member email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "org_admin" | "org_member")}
            >
              <option value="org_member">Org Member</option>
              <option value="org_admin">Org Admin</option>
            </select>
            <Button type="button" onClick={() => void sendInvite()}>
              Invite
            </Button>
          </div>
          <div className="space-y-2">
            {(members ?? []).map((member) => (
              <div key={member.userId} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[member.email, member.title, member.role].filter(Boolean).join(" • ")}
                </p>
              </div>
            ))}
            {members?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
