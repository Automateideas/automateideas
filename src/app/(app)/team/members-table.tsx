"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseRoles, roleLabel } from "@/lib/roles";

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  joinedAt: string;
};

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Members with name, email, contact number, role and join date. `action` adds a per-row button. */
export function MembersTable({
  members,
  currentUserId,
  action,
}: {
  members: TeamMember[];
  currentUserId: string;
  action?: (member: TeamMember) => React.ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="hidden md:table-cell">Email</TableHead>
          <TableHead className="hidden lg:table-cell">Contact</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="hidden xl:table-cell">Joined</TableHead>
          {action ? (
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => {
          const isOwner = parseRoles(m.role).includes("owner");
          const isYou = m.userId === currentUserId;
          return (
            <TableRow key={m.id}>
              <TableCell>
                <div className="flex max-w-40 min-w-0 flex-col sm:max-w-none">
                  <span className="truncate font-medium">
                    {m.name}
                    {isYou ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                  </span>
                  {/* On small screens, email and contact sit under the name. */}
                  <a href={`mailto:${m.email}`} className="truncate text-xs text-muted-foreground hover:underline md:hidden">
                    {m.email}
                  </a>
                  {m.phone ? (
                    <a href={`tel:${m.phone.replace(/\s+/g, "")}`} className="truncate text-xs text-muted-foreground hover:underline lg:hidden">
                      {m.phone}
                    </a>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <a href={`mailto:${m.email}`} className="text-muted-foreground hover:text-foreground hover:underline">
                  {m.email}
                </a>
              </TableCell>
              <TableCell className="hidden tabular-nums lg:table-cell">
                {m.phone ? (
                  <a
                    href={`tel:${m.phone.replace(/\s+/g, "")}`}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {m.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground" aria-label="No contact number">
                    —
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={isOwner ? "default" : "secondary"}>{roleLabel(m.role)}</Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground xl:table-cell">
                {dateFormat.format(new Date(m.joinedAt))}
              </TableCell>
              {action ? <TableCell className="text-right">{action(m)}</TableCell> : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
