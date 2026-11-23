import VerifyEmail from "./VerifyEmail";

export const metadata = { title: "Verifikasi email" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === "string" ? token : ""} />;
}
