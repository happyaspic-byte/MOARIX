"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import {
  createAssetLicense,
  createAssetNetwork,
  createAssetNode,
  createAssetSupportContract,
  createAssetVirtualMachine,
  updateAssetLicense,
  updateAssetNetwork,
  updateAssetNode,
  updateAssetOperationsProfile,
  updateAssetVirtualMachine,
} from "@/lib/services/assets-service";
import {
  assetContractSchema,
  assetLicenseSchema,
  assetLicenseUpdateSchema,
  assetNetworkSchema,
  assetNetworkUpdateSchema,
  assetNodeSchema,
  assetNodeUpdateSchema,
  assetProfileSchema,
  assetVmSchema,
  assetVmUpdateSchema,
} from "@/lib/validation/forms";

function refreshAsset(assetId: string) {
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/service");
  revalidatePath("/inspections");
}

function invalid(message?: string): FormState {
  return { status: "error", message: message ?? "입력값을 확인해 주세요." };
}

export async function updateAssetProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await updateAssetOperationsProfile(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "자산 운영 프로필을 갱신했습니다." };
  } catch (error) {
    return invalid(publicError(error, "자산 운영 프로필을 갱신하지 못했습니다."));
  }
}

export async function createAssetNodeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetNodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await createAssetNode(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "노드·컴퓨트 모듈을 등록했습니다." };
  } catch (error) {
    return invalid(publicError(error, "노드를 등록하지 못했습니다."));
  }
}

export async function updateAssetNodeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetNodeUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await updateAssetNode(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "노드·컴퓨트 모듈을 수정했습니다." };
  } catch (error) {
    return invalid(publicError(error, "노드를 수정하지 못했습니다."));
  }
}

export async function createAssetNetworkAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetNetworkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await createAssetNetwork(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "네트워크 인터페이스를 등록했습니다." };
  } catch (error) {
    return invalid(publicError(error, "네트워크 인터페이스를 등록하지 못했습니다."));
  }
}

export async function updateAssetNetworkAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetNetworkUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await updateAssetNetwork(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "네트워크 인터페이스를 수정했습니다." };
  } catch (error) {
    return invalid(publicError(error, "네트워크 인터페이스를 수정하지 못했습니다."));
  }
}

export async function createAssetVmAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetVmSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await createAssetVirtualMachine(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "가상 머신 구성을 등록했습니다." };
  } catch (error) {
    return invalid(publicError(error, "가상 머신을 등록하지 못했습니다."));
  }
}

export async function updateAssetVmAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetVmUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await updateAssetVirtualMachine(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "가상 머신 구성을 수정했습니다." };
  } catch (error) {
    return invalid(publicError(error, "가상 머신을 수정하지 못했습니다."));
  }
}

export async function createAssetContractAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetContractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await createAssetSupportContract(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "지원 계약 개정 이력을 등록했습니다." };
  } catch (error) {
    return invalid(publicError(error, "지원 계약을 등록하지 못했습니다."));
  }
}

export async function createAssetLicenseAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetLicenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await createAssetLicense(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "라이선스·Entitlement를 등록했습니다." };
  } catch (error) {
    return invalid(publicError(error, "라이선스를 등록하지 못했습니다."));
  }
}

export async function updateAssetLicenseAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = assetLicenseUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  try {
    const session = await requirePermission("assets:write");
    await updateAssetLicense(session, parsed.data);
    refreshAsset(parsed.data.assetId);
    return { status: "success", message: "라이선스·Entitlement를 수정했습니다." };
  } catch (error) {
    return invalid(publicError(error, "라이선스를 수정하지 못했습니다."));
  }
}
