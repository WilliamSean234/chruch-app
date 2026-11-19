/** Label rapat untuk orang yang bukan anggota kelompok: hanya nama kelompok, plus topik bila pembuat mengizinkan. */
export const meetingPublicTitle = (groupName: string, title: string, showTopic: boolean) =>
  showTopic ? `Rapat ${groupName}: ${title}` : `Rapat ${groupName}`;

/** Label untuk anggota kelompok: selalu lengkap dengan topiknya. */
export const meetingMemberTitle = (groupName: string, title: string) => `Rapat ${groupName}: ${title}`;
