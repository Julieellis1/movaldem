"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FormProvider,
  useForm,
  useFormContext,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import type { ZodType } from "zod";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Typed shell: a Zod schema drives validation, children render inside the
// react-hook-form context, inline errors show under fields (aria-live), and
// the submit button disables while pending (ADM-04/05, A11Y-04).
export function FormShell<T extends FieldValues>({
  schema,
  onSubmit,
  children,
  submitLabel = "Submit",
  className,
}: {
  schema: ZodType<T>;
  onSubmit: (values: T) => void | Promise<void>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const form = useForm<T>({
    // zodResolver's overloads don't narrow ZodType<T>'s input generic the way
    // RHF expects; the runtime behaviour is correct for our object schemas.
    resolver: zodResolver(schema as never) as unknown as Resolver<T>,
  });
  const [pending, setPending] = React.useState(false);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className={cn("space-y-4", className)}
        onSubmit={form.handleSubmit(async (values) => {
          setPending(true);
          try {
            await onSubmit(values);
          } finally {
            setPending(false);
          }
        })}
      >
        {children}
        <button
          type="submit"
          disabled={pending || form.formState.isSubmitting}
          className="inline-flex h-10 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Please wait…" : submitLabel}
        </button>
      </form>
    </FormProvider>
  );
}

// Labelled pill input wired to the surrounding FormShell; errors render
// under the field with role="alert" + aria-invalid on the input.
export function FormField({
  name,
  label,
  type = "text",
  autoComplete,
  placeholder,
  className,
}: {
  name: string;
  label: string;
  type?: React.HTMLInputTypeAttribute;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
}) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name];

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...register(name)}
      />
      {error && (
        <p
          id={`${name}-error`}
          role="alert"
          aria-live="polite"
          className="text-body-sm text-destructive"
        >
          {String(error.message)}
        </p>
      )}
    </div>
  );
}
