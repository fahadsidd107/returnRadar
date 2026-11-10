/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type Activity = {
  __typename?: 'Activity';
  kind: Scalars['String']['output'];
  occurredAt: Scalars['String']['output'];
};

export type Auth = {
  __typename?: 'Auth';
  expiresAt: Scalars['String']['output'];
  refreshToken: Scalars['String']['output'];
  token: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  advanceReturn: Scalars['Boolean']['output'];
  archivePurchase: Scalars['Boolean']['output'];
  assignParcelToRun: Scalars['Boolean']['output'];
  completeRunStop: Scalars['Boolean']['output'];
  createPurchase: Scalars['String']['output'];
  createReturnRun: Scalars['String']['output'];
  deleteAccount: Scalars['Boolean']['output'];
  deletePurchase: Scalars['Boolean']['output'];
  logout: Scalars['Boolean']['output'];
  recordRefund: Scalars['Boolean']['output'];
  refreshSession: Auth;
  register: Scalars['Boolean']['output'];
  requestPasswordReset: Scalars['Boolean']['output'];
  resetPassword: Scalars['Boolean']['output'];
  signIn: Auth;
  startReturn: Scalars['String']['output'];
  updatePurchase: Scalars['Boolean']['output'];
  verifyEmail: Scalars['Boolean']['output'];
};


export type MutationAdvanceReturnArgs = {
  carrier?: InputMaybe<Scalars['String']['input']>;
  label?: InputMaybe<Scalars['String']['input']>;
  nextState: Scalars['String']['input'];
  returnId: Scalars['String']['input'];
};


export type MutationArchivePurchaseArgs = {
  purchaseId: Scalars['String']['input'];
  version: Scalars['Int']['input'];
};


export type MutationAssignParcelToRunArgs = {
  position: Scalars['Int']['input'];
  returnId: Scalars['String']['input'];
  runId: Scalars['String']['input'];
  stopName: Scalars['String']['input'];
};


export type MutationCompleteRunStopArgs = {
  evidenceNote: Scalars['String']['input'];
  returnId: Scalars['String']['input'];
  runId: Scalars['String']['input'];
};


export type MutationCreatePurchaseArgs = {
  amountMinor: Scalars['String']['input'];
  currency: Scalars['String']['input'];
  deadline: Scalars['String']['input'];
  item: Scalars['String']['input'];
  merchant: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateReturnRunArgs = {
  name: Scalars['String']['input'];
  plannedAt: Scalars['String']['input'];
};


export type MutationDeletePurchaseArgs = {
  purchaseId: Scalars['String']['input'];
  version: Scalars['Int']['input'];
};


export type MutationRecordRefundArgs = {
  amountMinor: Scalars['String']['input'];
  returnId: Scalars['String']['input'];
};


export type MutationRefreshSessionArgs = {
  refreshToken: Scalars['String']['input'];
};


export type MutationRegisterArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationRequestPasswordResetArgs = {
  email: Scalars['String']['input'];
};


export type MutationResetPasswordArgs = {
  password: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type MutationSignInArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationStartReturnArgs = {
  category: Scalars['Int']['input'];
  method: Scalars['Int']['input'];
  purchaseId: Scalars['String']['input'];
};


export type MutationUpdatePurchaseArgs = {
  deadline: Scalars['String']['input'];
  item: Scalars['String']['input'];
  merchant: Scalars['String']['input'];
  notes: Scalars['String']['input'];
  purchaseId: Scalars['String']['input'];
  version: Scalars['Int']['input'];
};


export type MutationVerifyEmailArgs = {
  token: Scalars['String']['input'];
};

export type Purchase = {
  __typename?: 'Purchase';
  amountMinor: Scalars['String']['output'];
  currency: Scalars['String']['output'];
  deadline: Scalars['String']['output'];
  id: Scalars['String']['output'];
  item: Scalars['String']['output'];
  merchant: Scalars['String']['output'];
  notes: Scalars['String']['output'];
  version: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  exportData: Scalars['String']['output'];
  purchases: Array<Purchase>;
  returns: Array<Return>;
  runParcels: Array<RunParcel>;
  runs: Array<Run>;
  similarPastReturns: Array<Similar>;
  timeline: Array<Activity>;
};


export type QueryPurchasesArgs = {
  offset?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRunParcelsArgs = {
  runId: Scalars['String']['input'];
};


export type QuerySimilarPastReturnsArgs = {
  category: Scalars['Int']['input'];
  method: Scalars['Int']['input'];
  purchaseId: Scalars['String']['input'];
};


export type QueryTimelineArgs = {
  aggregateId: Scalars['String']['input'];
};

export type Return = {
  __typename?: 'Return';
  carrier: Scalars['String']['output'];
  currency: Scalars['String']['output'];
  expectedMinor: Scalars['String']['output'];
  id: Scalars['String']['output'];
  item: Scalars['String']['output'];
  label: Scalars['String']['output'];
  merchant: Scalars['String']['output'];
  purchaseId: Scalars['String']['output'];
  receivedMinor: Scalars['String']['output'];
  remainingMinor: Scalars['String']['output'];
  state: Scalars['String']['output'];
};

export type Run = {
  __typename?: 'Run';
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  plannedAt: Scalars['String']['output'];
};

export type RunParcel = {
  __typename?: 'RunParcel';
  carrier: Scalars['String']['output'];
  evidenceNote: Scalars['String']['output'];
  handedOverAt?: Maybe<Scalars['String']['output']>;
  item: Scalars['String']['output'];
  label: Scalars['String']['output'];
  position: Scalars['Int']['output'];
  returnId: Scalars['String']['output'];
  state: Scalars['String']['output'];
  stopName: Scalars['String']['output'];
};

export type Similar = {
  __typename?: 'Similar';
  distance: Scalars['Float']['output'];
  explanation: Scalars['String']['output'];
  item: Scalars['String']['output'];
  returnId: Scalars['String']['output'];
};

export type DashboardQueryVariables = Exact<{ [key: string]: never; }>;


export type DashboardQuery = { purchases: Array<{ id: string, merchant: string, item: string, amountMinor: string, currency: string, deadline: string, notes: string, version: number }>, returns: Array<{ id: string, purchaseId: string, item: string, merchant: string, currency: string, state: string, expectedMinor: string, receivedMinor: string, remainingMinor: string, label: string, carrier: string }>, runs: Array<{ id: string, name: string, plannedAt: string }> };

export type SignInMutationVariables = Exact<{
  email: string;
  password: string;
}>;


export type SignInMutation = { signIn: { token: string, refreshToken: string, expiresAt: string } };

export type CreatePurchaseMutationVariables = Exact<{
  merchant: string;
  item: string;
  amountMinor: string;
  currency: string;
  deadline: string;
  notes?: string | null | undefined;
}>;


export type CreatePurchaseMutation = { createPurchase: string };

export type RunParcelsQueryVariables = Exact<{
  runId: string;
}>;


export type RunParcelsQuery = { runParcels: Array<{ returnId: string, item: string, label: string, carrier: string, state: string, stopName: string, position: number, handedOverAt: string | null, evidenceNote: string }> };

export type SimilarPastReturnsQueryVariables = Exact<{
  purchaseId: string;
  category: number;
  method: number;
}>;


export type SimilarPastReturnsQuery = { similarPastReturns: Array<{ returnId: string, item: string, distance: number, explanation: string }> };
