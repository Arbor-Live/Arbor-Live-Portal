export function formatContactFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function splitContactName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function resolveContactNameParts(contact: {
  firstName?: string;
  lastName?: string;
  name?: string;
}) {
  if (contact.firstName?.trim() && contact.lastName !== undefined) {
    return {
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
    };
  }
  if (contact.name?.trim()) {
    return splitContactName(contact.name);
  }
  return { firstName: "", lastName: "" };
}

export function contactDisplayName(contact: {
  firstName?: string;
  lastName?: string;
  name?: string;
}) {
  const parts = resolveContactNameParts(contact);
  const fullName = formatContactFullName(parts.firstName, parts.lastName);
  if (fullName) return fullName;
  return contact.name?.trim() ?? "";
}

export function contactSortKey(contact: {
  firstName?: string;
  lastName?: string;
  name?: string;
}) {
  return contactDisplayName(contact).toLowerCase();
}
