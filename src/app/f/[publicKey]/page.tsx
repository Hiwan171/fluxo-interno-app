import { notFound } from "next/navigation";

import { PublicIntakeForm } from "@/app/f/[publicKey]/public-intake-form";
import { ResourceNotFoundError } from "@/lib/dal";
import { getPublicIntakeForm } from "@/lib/public-forms";

export default async function PublicIntakeFormPage({
  params,
}: {
  params: Promise<{ publicKey: string }>;
}) {
  const { publicKey } = await params;

  let data: Awaited<ReturnType<typeof getPublicIntakeForm>>;
  try {
    data = await getPublicIntakeForm(publicKey);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <PublicIntakeForm
      publicKey={publicKey}
      formName={data.form.name}
      formDescription={data.form.description}
      boardName={data.board?.name ?? "Fluxo Interno"}
      boardColor={data.board?.color ?? "#2563eb"}
      fields={data.fields}
    />
  );
}
