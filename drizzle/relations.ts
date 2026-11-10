import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	account: {
		user: r.one.user({
			from: r.account.userId,
			to: r.user.id
		}),
	},
	user: {
		accountsUserId: r.many.account(),
		accountsCreatedBy: r.many.accounts({
			alias: "accounts_createdBy_user_id"
		}),
		accountsUpdatedBy: r.many.accounts({
			alias: "accounts_updatedBy_user_id"
		}),
		organizationsViaAuditLogs: r.many.organization({
			from: r.user.id.through(r.auditLogs.actorUserId),
			to: r.organization.id.through(r.auditLogs.organizationId),
			alias: "user_id_organization_id_via_auditLogs"
		}),
		auditLogs: r.many.auditLogs(),
		organizationsViaBillingFiles: r.many.organization({
			alias: "organization_id_user_id_via_billingFiles"
		}),
		billingFiles: r.many.billingFiles(),
		organizationsViaBillingSettings: r.many.organization({
			alias: "organization_id_user_id_via_billingSettings"
		}),
		billingSettings: r.many.billingSettings(),
		businessInvoiceItemsCreatedBy: r.many.businessInvoiceItems({
			alias: "businessInvoiceItems_createdBy_user_id"
		}),
		businessInvoiceItemsUpdatedBy: r.many.businessInvoiceItems({
			alias: "businessInvoiceItems_updatedBy_user_id"
		}),
		businessInvoicesCreatedBy: r.many.businessInvoices({
			alias: "businessInvoices_createdBy_user_id"
		}),
		businessInvoicesUpdatedBy: r.many.businessInvoices({
			alias: "businessInvoices_updatedBy_user_id"
		}),
		businessPaymentsCreatedBy: r.many.businessPayments({
			alias: "businessPayments_createdBy_user_id"
		}),
		businessPaymentsUpdatedBy: r.many.businessPayments({
			alias: "businessPayments_updatedBy_user_id"
		}),
		companyBranchesCreatedBy: r.many.companyBranches({
			alias: "companyBranches_createdBy_user_id"
		}),
		companyBranchesUpdatedBy: r.many.companyBranches({
			alias: "companyBranches_updatedBy_user_id"
		}),
		creditNoteItemsCreatedBy: r.many.creditNoteItems({
			alias: "creditNoteItems_createdBy_user_id"
		}),
		creditNoteItemsUpdatedBy: r.many.creditNoteItems({
			alias: "creditNoteItems_updatedBy_user_id"
		}),
		creditNotesCreatedBy: r.many.creditNotes({
			alias: "creditNotes_createdBy_user_id"
		}),
		creditNotesUpdatedBy: r.many.creditNotes({
			alias: "creditNotes_updatedBy_user_id"
		}),
		customerAddressesCreatedBy: r.many.customerAddresses({
			alias: "customerAddresses_createdBy_user_id"
		}),
		customerAddressesUpdatedBy: r.many.customerAddresses({
			alias: "customerAddresses_updatedBy_user_id"
		}),
		customersCreatedBy: r.many.customers({
			alias: "customers_createdBy_user_id"
		}),
		customersUpdatedBy: r.many.customers({
			alias: "customers_updatedBy_user_id"
		}),
		debitNoteItemsCreatedBy: r.many.debitNoteItems({
			alias: "debitNoteItems_createdBy_user_id"
		}),
		debitNoteItemsUpdatedBy: r.many.debitNoteItems({
			alias: "debitNoteItems_updatedBy_user_id"
		}),
		debitNotesCreatedBy: r.many.debitNotes({
			alias: "debitNotes_createdBy_user_id"
		}),
		debitNotesUpdatedBy: r.many.debitNotes({
			alias: "debitNotes_updatedBy_user_id"
		}),
		organizationsViaInvitation: r.many.organization({
			from: r.user.id.through(r.invitation.inviterId),
			to: r.organization.id.through(r.invitation.organizationId),
			alias: "user_id_organization_id_via_invitation"
		}),
		invitations: r.many.invitation(),
		invoiceSequencesCreatedBy: r.many.invoiceSequences({
			alias: "invoiceSequences_createdBy_user_id"
		}),
		invoiceSequencesUpdatedBy: r.many.invoiceSequences({
			alias: "invoiceSequences_updatedBy_user_id"
		}),
		journalEntriesCreatedBy: r.many.journalEntries({
			alias: "journalEntries_createdBy_user_id"
		}),
		journalEntriesUpdatedBy: r.many.journalEntries({
			alias: "journalEntries_updatedBy_user_id"
		}),
		journalLinesCreatedBy: r.many.journalLines({
			alias: "journalLines_createdBy_user_id"
		}),
		journalLinesUpdatedBy: r.many.journalLines({
			alias: "journalLines_updatedBy_user_id"
		}),
		organizationsViaMember: r.many.organization({
			alias: "organization_id_user_id_via_member"
		}),
		members: r.one.member(),
		paymentAllocationsCreatedBy: r.many.paymentAllocations({
			alias: "paymentAllocations_createdBy_user_id"
		}),
		paymentAllocationsUpdatedBy: r.many.paymentAllocations({
			alias: "paymentAllocations_updatedBy_user_id"
		}),
		priceListItemsCreatedBy: r.many.priceListItems({
			alias: "priceListItems_createdBy_user_id"
		}),
		priceListItemsUpdatedBy: r.many.priceListItems({
			alias: "priceListItems_updatedBy_user_id"
		}),
		priceListsCreatedBy: r.many.priceLists({
			alias: "priceLists_createdBy_user_id"
		}),
		priceListsUpdatedBy: r.many.priceLists({
			alias: "priceLists_updatedBy_user_id"
		}),
		productCategoriesCreatedBy: r.many.productCategories({
			alias: "productCategories_createdBy_user_id"
		}),
		productCategoriesUpdatedBy: r.many.productCategories({
			alias: "productCategories_updatedBy_user_id"
		}),
		productsCreatedBy: r.many.products({
			alias: "products_createdBy_user_id"
		}),
		productsUpdatedBy: r.many.products({
			alias: "products_updatedBy_user_id"
		}),
		purchaseBillItemsCreatedBy: r.many.purchaseBillItems({
			alias: "purchaseBillItems_createdBy_user_id"
		}),
		purchaseBillItemsUpdatedBy: r.many.purchaseBillItems({
			alias: "purchaseBillItems_updatedBy_user_id"
		}),
		purchaseBillsCreatedBy: r.many.purchaseBills({
			alias: "purchaseBills_createdBy_user_id"
		}),
		purchaseBillsUpdatedBy: r.many.purchaseBills({
			alias: "purchaseBills_updatedBy_user_id"
		}),
		purchaseOrderItemsCreatedBy: r.many.purchaseOrderItems({
			alias: "purchaseOrderItems_createdBy_user_id"
		}),
		purchaseOrderItemsUpdatedBy: r.many.purchaseOrderItems({
			alias: "purchaseOrderItems_updatedBy_user_id"
		}),
		purchaseOrdersCreatedBy: r.many.purchaseOrders({
			alias: "purchaseOrders_createdBy_user_id"
		}),
		purchaseOrdersUpdatedBy: r.many.purchaseOrders({
			alias: "purchaseOrders_updatedBy_user_id"
		}),
		quotationItemsCreatedBy: r.many.quotationItems({
			alias: "quotationItems_createdBy_user_id"
		}),
		quotationItemsUpdatedBy: r.many.quotationItems({
			alias: "quotationItems_updatedBy_user_id"
		}),
		quotationsCreatedBy: r.many.quotations({
			alias: "quotations_createdBy_user_id"
		}),
		quotationsUpdatedBy: r.many.quotations({
			alias: "quotations_updatedBy_user_id"
		}),
		refundsCreatedBy: r.many.refunds({
			alias: "refunds_createdBy_user_id"
		}),
		refundsUpdatedBy: r.many.refunds({
			alias: "refunds_updatedBy_user_id"
		}),
		salesOrderItemsCreatedBy: r.many.salesOrderItems({
			alias: "salesOrderItems_createdBy_user_id"
		}),
		salesOrderItemsUpdatedBy: r.many.salesOrderItems({
			alias: "salesOrderItems_updatedBy_user_id"
		}),
		salesOrdersCreatedBy: r.many.salesOrders({
			alias: "salesOrders_createdBy_user_id"
		}),
		salesOrdersUpdatedBy: r.many.salesOrders({
			alias: "salesOrders_updatedBy_user_id"
		}),
		servicesCreatedBy: r.many.services({
			alias: "services_createdBy_user_id"
		}),
		servicesUpdatedBy: r.many.services({
			alias: "services_updatedBy_user_id"
		}),
		sessions: r.many.session(),
		suppliersCreatedBy: r.many.suppliers({
			alias: "suppliers_createdBy_user_id"
		}),
		suppliersUpdatedBy: r.many.suppliers({
			alias: "suppliers_updatedBy_user_id"
		}),
		unitsCreatedBy: r.many.units({
			alias: "units_createdBy_user_id"
		}),
		unitsUpdatedBy: r.many.units({
			alias: "units_updatedBy_user_id"
		}),
	},
	accounts: {
		userCreatedBy: r.one.user({
			from: r.accounts.createdBy,
			to: r.user.id,
			alias: "accounts_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.accounts.organizationId,
			to: r.organization.id
		}),
		account: r.one.accounts({
			from: [r.accounts.organizationId, r.accounts.parentId],
			to: [r.accounts.organizationId, r.accounts.id],
			alias: "accounts_organizationId_parentId_accounts_organizationId_id"
		}),
		accounts: r.many.accounts({
			alias: "accounts_organizationId_parentId_accounts_organizationId_id"
		}),
		userUpdatedBy: r.one.user({
			from: r.accounts.updatedBy,
			to: r.user.id,
			alias: "accounts_updatedBy_user_id"
		}),
		businessPayments: r.many.businessPayments(),
		journalLines: r.many.journalLines(),
		refunds: r.many.refunds(),
	},
	organization: {
		accounts: r.many.accounts(),
		usersViaAuditLogs: r.many.user({
			alias: "user_id_organization_id_via_auditLogs"
		}),
		auditLogs: r.many.auditLogs(),
		usersViaBillingFiles: r.many.user({
			from: r.organization.id.through(r.billingFiles.organizationId),
			to: r.user.id.through(r.billingFiles.uploadedBy),
			alias: "organization_id_user_id_via_billingFiles"
		}),
		billingFiles: r.many.billingFiles(),
		usersViaBillingSettings: r.many.user({
			from: r.organization.id.through(r.billingSettings.organizationId),
			to: r.user.id.through(r.billingSettings.updatedBy),
			alias: "organization_id_user_id_via_billingSettings"
		}),
		billingSettings: r.many.billingSettings(),
		businessInvoiceItems: r.many.businessInvoiceItems(),
		businessInvoices: r.many.businessInvoices(),
		businessPayments: r.many.businessPayments(),
		companyBranches: r.one.companyBranches(),
		creditNoteItems: r.many.creditNoteItems(),
		creditNotes: r.many.creditNotes(),
		customerAddresses: r.many.customerAddresses(),
		customers: r.many.customers(),
		debitNoteItems: r.many.debitNoteItems(),
		debitNotes: r.many.debitNotes(),
		usersViaInvitation: r.many.user({
			alias: "user_id_organization_id_via_invitation"
		}),
		invitations: r.many.invitation(),
		invoiceSequences: r.many.invoiceSequences(),
		journalEntries: r.many.journalEntries(),
		journalLines: r.many.journalLines(),
		usersViaMember: r.many.user({
			from: r.organization.id.through(r.member.organizationId),
			to: r.user.id.through(r.member.userId),
			alias: "organization_id_user_id_via_member"
		}),
		members: r.many.member(),
		paymentAllocations: r.many.paymentAllocations(),
		priceListItems: r.many.priceListItems(),
		priceLists: r.one.priceLists(),
		productCategories: r.many.productCategories(),
		products: r.many.products(),
		purchaseBillItems: r.many.purchaseBillItems(),
		purchaseBills: r.many.purchaseBills(),
		purchaseOrderItems: r.many.purchaseOrderItems(),
		purchaseOrders: r.many.purchaseOrders(),
		quotationItems: r.many.quotationItems(),
		quotations: r.many.quotations(),
		refunds: r.many.refunds(),
		salesOrderItems: r.many.salesOrderItems(),
		salesOrders: r.many.salesOrders(),
		services: r.many.services(),
		subscriptionPayments: r.many.subscriptionPayment(),
		suppliers: r.many.suppliers(),
		units: r.many.units(),
	},
	auditLogs: {
		user: r.one.user({
			from: r.auditLogs.actorUserId,
			to: r.user.id
		}),
		organization: r.one.organization({
			from: r.auditLogs.organizationId,
			to: r.organization.id
		}),
	},
	billingFiles: {
		organization: r.one.organization({
			from: r.billingFiles.organizationId,
			to: r.organization.id
		}),
		user: r.one.user({
			from: r.billingFiles.uploadedBy,
			to: r.user.id
		}),
	},
	billingSettings: {
		organization: r.one.organization({
			from: r.billingSettings.organizationId,
			to: r.organization.id
		}),
		user: r.one.user({
			from: r.billingSettings.updatedBy,
			to: r.user.id
		}),
	},
	businessInvoiceItems: {
		userCreatedBy: r.one.user({
			from: r.businessInvoiceItems.createdBy,
			to: r.user.id,
			alias: "businessInvoiceItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.businessInvoiceItems.organizationId,
			to: r.organization.id
		}),
		businessInvoice: r.one.businessInvoices({
			from: [r.businessInvoiceItems.organizationId, r.businessInvoiceItems.invoiceId],
			to: [r.businessInvoices.organizationId, r.businessInvoices.id]
		}),
		product: r.one.products({
			from: [r.businessInvoiceItems.organizationId, r.businessInvoiceItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.businessInvoiceItems.organizationId, r.businessInvoiceItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.businessInvoiceItems.updatedBy,
			to: r.user.id,
			alias: "businessInvoiceItems_updatedBy_user_id"
		}),
	},
	businessInvoices: {
		businessInvoiceItems: r.many.businessInvoiceItems(),
		companyBranch: r.one.companyBranches({
			from: [r.businessInvoices.organizationId, r.businessInvoices.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.businessInvoices.createdBy,
			to: r.user.id,
			alias: "businessInvoices_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.businessInvoices.organizationId,
			to: r.organization.id
		}),
		customer: r.one.customers({
			from: [r.businessInvoices.organizationId, r.businessInvoices.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		quotation: r.one.quotations({
			from: [r.businessInvoices.organizationId, r.businessInvoices.quotationId],
			to: [r.quotations.organizationId, r.quotations.id]
		}),
		salesOrder: r.one.salesOrders({
			from: [r.businessInvoices.organizationId, r.businessInvoices.salesOrderId],
			to: [r.salesOrders.organizationId, r.salesOrders.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.businessInvoices.updatedBy,
			to: r.user.id,
			alias: "businessInvoices_updatedBy_user_id"
		}),
		creditNotes: r.many.creditNotes(),
		debitNotes: r.many.debitNotes(),
		paymentAllocations: r.many.paymentAllocations(),
	},
	products: {
		businessInvoiceItems: r.many.businessInvoiceItems(),
		creditNoteItems: r.many.creditNoteItems(),
		debitNoteItems: r.many.debitNoteItems(),
		priceListItems: r.many.priceListItems(),
		productCategory: r.one.productCategories({
			from: [r.products.organizationId, r.products.categoryId],
			to: [r.productCategories.organizationId, r.productCategories.id]
		}),
		userCreatedBy: r.one.user({
			from: r.products.createdBy,
			to: r.user.id,
			alias: "products_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.products.organizationId,
			to: r.organization.id
		}),
		unit: r.one.units({
			from: [r.products.organizationId, r.products.unitId],
			to: [r.units.organizationId, r.units.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.products.updatedBy,
			to: r.user.id,
			alias: "products_updatedBy_user_id"
		}),
		purchaseBillItems: r.many.purchaseBillItems(),
		purchaseOrderItems: r.many.purchaseOrderItems(),
		quotationItems: r.many.quotationItems(),
		salesOrderItems: r.many.salesOrderItems(),
	},
	services: {
		businessInvoiceItems: r.many.businessInvoiceItems(),
		creditNoteItems: r.many.creditNoteItems(),
		debitNoteItems: r.many.debitNoteItems(),
		priceListItems: r.many.priceListItems(),
		purchaseBillItems: r.many.purchaseBillItems(),
		purchaseOrderItems: r.many.purchaseOrderItems(),
		quotationItems: r.many.quotationItems(),
		salesOrderItems: r.many.salesOrderItems(),
		productCategory: r.one.productCategories({
			from: [r.services.organizationId, r.services.categoryId],
			to: [r.productCategories.organizationId, r.productCategories.id]
		}),
		userCreatedBy: r.one.user({
			from: r.services.createdBy,
			to: r.user.id,
			alias: "services_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.services.organizationId,
			to: r.organization.id
		}),
		unit: r.one.units({
			from: [r.services.organizationId, r.services.unitId],
			to: [r.units.organizationId, r.units.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.services.updatedBy,
			to: r.user.id,
			alias: "services_updatedBy_user_id"
		}),
	},
	companyBranches: {
		businessInvoices: r.many.businessInvoices(),
		userCreatedBy: r.one.user({
			from: r.companyBranches.createdBy,
			to: r.user.id,
			alias: "companyBranches_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.companyBranches.organizationId,
			to: r.organization.id
		}),
		userUpdatedBy: r.one.user({
			from: r.companyBranches.updatedBy,
			to: r.user.id,
			alias: "companyBranches_updatedBy_user_id"
		}),
		creditNotes: r.many.creditNotes(),
		debitNotes: r.many.debitNotes(),
		invoiceSequences: r.many.invoiceSequences(),
		purchaseBills: r.many.purchaseBills(),
		purchaseOrders: r.many.purchaseOrders(),
		quotations: r.many.quotations(),
		salesOrders: r.many.salesOrders(),
	},
	customers: {
		businessInvoices: r.many.businessInvoices(),
		businessPayments: r.many.businessPayments(),
		creditNotes: r.many.creditNotes(),
		customerAddresses: r.many.customerAddresses(),
		userCreatedBy: r.one.user({
			from: r.customers.createdBy,
			to: r.user.id,
			alias: "customers_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.customers.organizationId,
			to: r.organization.id
		}),
		priceList: r.one.priceLists({
			from: [r.customers.organizationId, r.customers.priceListId],
			to: [r.priceLists.organizationId, r.priceLists.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.customers.updatedBy,
			to: r.user.id,
			alias: "customers_updatedBy_user_id"
		}),
		debitNotes: r.many.debitNotes(),
		journalLines: r.many.journalLines(),
		quotations: r.many.quotations(),
		refunds: r.many.refunds(),
		salesOrders: r.many.salesOrders(),
	},
	quotations: {
		businessInvoices: r.many.businessInvoices(),
		quotationItems: r.many.quotationItems(),
		companyBranch: r.one.companyBranches({
			from: [r.quotations.organizationId, r.quotations.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.quotations.createdBy,
			to: r.user.id,
			alias: "quotations_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.quotations.organizationId,
			to: r.organization.id
		}),
		customer: r.one.customers({
			from: [r.quotations.organizationId, r.quotations.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.quotations.updatedBy,
			to: r.user.id,
			alias: "quotations_updatedBy_user_id"
		}),
		salesOrders: r.many.salesOrders(),
	},
	salesOrders: {
		businessInvoices: r.many.businessInvoices(),
		salesOrderItems: r.many.salesOrderItems(),
		companyBranch: r.one.companyBranches({
			from: [r.salesOrders.organizationId, r.salesOrders.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.salesOrders.createdBy,
			to: r.user.id,
			alias: "salesOrders_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.salesOrders.organizationId,
			to: r.organization.id
		}),
		customer: r.one.customers({
			from: [r.salesOrders.organizationId, r.salesOrders.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		quotation: r.one.quotations({
			from: [r.salesOrders.organizationId, r.salesOrders.quotationId],
			to: [r.quotations.organizationId, r.quotations.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.salesOrders.updatedBy,
			to: r.user.id,
			alias: "salesOrders_updatedBy_user_id"
		}),
	},
	businessPayments: {
		account: r.one.accounts({
			from: [r.businessPayments.organizationId, r.businessPayments.accountId],
			to: [r.accounts.organizationId, r.accounts.id]
		}),
		userCreatedBy: r.one.user({
			from: r.businessPayments.createdBy,
			to: r.user.id,
			alias: "businessPayments_createdBy_user_id"
		}),
		customer: r.one.customers({
			from: [r.businessPayments.organizationId, r.businessPayments.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		organization: r.one.organization({
			from: r.businessPayments.organizationId,
			to: r.organization.id
		}),
		supplier: r.one.suppliers({
			from: [r.businessPayments.organizationId, r.businessPayments.supplierId],
			to: [r.suppliers.organizationId, r.suppliers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.businessPayments.updatedBy,
			to: r.user.id,
			alias: "businessPayments_updatedBy_user_id"
		}),
		paymentAllocations: r.many.paymentAllocations(),
		refunds: r.many.refunds(),
	},
	suppliers: {
		businessPayments: r.many.businessPayments(),
		journalLines: r.many.journalLines(),
		purchaseBills: r.many.purchaseBills(),
		purchaseOrders: r.many.purchaseOrders(),
		userCreatedBy: r.one.user({
			from: r.suppliers.createdBy,
			to: r.user.id,
			alias: "suppliers_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.suppliers.organizationId,
			to: r.organization.id
		}),
		userUpdatedBy: r.one.user({
			from: r.suppliers.updatedBy,
			to: r.user.id,
			alias: "suppliers_updatedBy_user_id"
		}),
	},
	creditNoteItems: {
		userCreatedBy: r.one.user({
			from: r.creditNoteItems.createdBy,
			to: r.user.id,
			alias: "creditNoteItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.creditNoteItems.organizationId,
			to: r.organization.id
		}),
		creditNote: r.one.creditNotes({
			from: [r.creditNoteItems.organizationId, r.creditNoteItems.creditNoteId],
			to: [r.creditNotes.organizationId, r.creditNotes.id]
		}),
		product: r.one.products({
			from: [r.creditNoteItems.organizationId, r.creditNoteItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.creditNoteItems.organizationId, r.creditNoteItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.creditNoteItems.updatedBy,
			to: r.user.id,
			alias: "creditNoteItems_updatedBy_user_id"
		}),
	},
	creditNotes: {
		creditNoteItems: r.many.creditNoteItems(),
		companyBranch: r.one.companyBranches({
			from: [r.creditNotes.organizationId, r.creditNotes.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.creditNotes.createdBy,
			to: r.user.id,
			alias: "creditNotes_createdBy_user_id"
		}),
		businessInvoice: r.one.businessInvoices({
			from: [r.creditNotes.organizationId, r.creditNotes.invoiceId],
			to: [r.businessInvoices.organizationId, r.businessInvoices.id]
		}),
		organization: r.one.organization({
			from: r.creditNotes.organizationId,
			to: r.organization.id
		}),
		customer: r.one.customers({
			from: [r.creditNotes.organizationId, r.creditNotes.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.creditNotes.updatedBy,
			to: r.user.id,
			alias: "creditNotes_updatedBy_user_id"
		}),
		refunds: r.many.refunds(),
	},
	customerAddresses: {
		userCreatedBy: r.one.user({
			from: r.customerAddresses.createdBy,
			to: r.user.id,
			alias: "customerAddresses_createdBy_user_id"
		}),
		customer: r.one.customers({
			from: [r.customerAddresses.organizationId, r.customerAddresses.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		organization: r.one.organization({
			from: r.customerAddresses.organizationId,
			to: r.organization.id
		}),
		userUpdatedBy: r.one.user({
			from: r.customerAddresses.updatedBy,
			to: r.user.id,
			alias: "customerAddresses_updatedBy_user_id"
		}),
	},
	priceLists: {
		customers: r.many.customers(),
		priceListItems: r.many.priceListItems(),
		userCreatedBy: r.one.user({
			from: r.priceLists.createdBy,
			to: r.user.id,
			alias: "priceLists_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.priceLists.organizationId,
			to: r.organization.id
		}),
		userUpdatedBy: r.one.user({
			from: r.priceLists.updatedBy,
			to: r.user.id,
			alias: "priceLists_updatedBy_user_id"
		}),
	},
	debitNoteItems: {
		userCreatedBy: r.one.user({
			from: r.debitNoteItems.createdBy,
			to: r.user.id,
			alias: "debitNoteItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.debitNoteItems.organizationId,
			to: r.organization.id
		}),
		debitNote: r.one.debitNotes({
			from: [r.debitNoteItems.organizationId, r.debitNoteItems.debitNoteId],
			to: [r.debitNotes.organizationId, r.debitNotes.id]
		}),
		product: r.one.products({
			from: [r.debitNoteItems.organizationId, r.debitNoteItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.debitNoteItems.organizationId, r.debitNoteItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.debitNoteItems.updatedBy,
			to: r.user.id,
			alias: "debitNoteItems_updatedBy_user_id"
		}),
	},
	debitNotes: {
		debitNoteItems: r.many.debitNoteItems(),
		companyBranch: r.one.companyBranches({
			from: [r.debitNotes.organizationId, r.debitNotes.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.debitNotes.createdBy,
			to: r.user.id,
			alias: "debitNotes_createdBy_user_id"
		}),
		businessInvoice: r.one.businessInvoices({
			from: [r.debitNotes.organizationId, r.debitNotes.invoiceId],
			to: [r.businessInvoices.organizationId, r.businessInvoices.id]
		}),
		organization: r.one.organization({
			from: r.debitNotes.organizationId,
			to: r.organization.id
		}),
		customer: r.one.customers({
			from: [r.debitNotes.organizationId, r.debitNotes.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.debitNotes.updatedBy,
			to: r.user.id,
			alias: "debitNotes_updatedBy_user_id"
		}),
	},
	invitation: {
		user: r.one.user({
			from: r.invitation.inviterId,
			to: r.user.id
		}),
		organization: r.one.organization({
			from: r.invitation.organizationId,
			to: r.organization.id
		}),
	},
	invoiceSequences: {
		companyBranch: r.one.companyBranches({
			from: [r.invoiceSequences.organizationId, r.invoiceSequences.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.invoiceSequences.createdBy,
			to: r.user.id,
			alias: "invoiceSequences_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.invoiceSequences.organizationId,
			to: r.organization.id
		}),
		userUpdatedBy: r.one.user({
			from: r.invoiceSequences.updatedBy,
			to: r.user.id,
			alias: "invoiceSequences_updatedBy_user_id"
		}),
	},
	journalEntries: {
		userCreatedBy: r.one.user({
			from: r.journalEntries.createdBy,
			to: r.user.id,
			alias: "journalEntries_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.journalEntries.organizationId,
			to: r.organization.id
		}),
		journalEntry: r.one.journalEntries({
			from: [r.journalEntries.organizationId, r.journalEntries.reversesEntryId],
			to: [r.journalEntries.organizationId, r.journalEntries.id],
			alias: "journalEntries_organizationId_reversesEntryId_journalEntries_organizationId_id"
		}),
		journalEntries: r.one.journalEntries({
			alias: "journalEntries_organizationId_reversesEntryId_journalEntries_organizationId_id"
		}),
		userUpdatedBy: r.one.user({
			from: r.journalEntries.updatedBy,
			to: r.user.id,
			alias: "journalEntries_updatedBy_user_id"
		}),
		journalLines: r.many.journalLines(),
	},
	journalLines: {
		account: r.one.accounts({
			from: [r.journalLines.organizationId, r.journalLines.accountId],
			to: [r.accounts.organizationId, r.accounts.id]
		}),
		userCreatedBy: r.one.user({
			from: r.journalLines.createdBy,
			to: r.user.id,
			alias: "journalLines_createdBy_user_id"
		}),
		customer: r.one.customers({
			from: [r.journalLines.organizationId, r.journalLines.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		journalEntry: r.one.journalEntries({
			from: [r.journalLines.organizationId, r.journalLines.entryId],
			to: [r.journalEntries.organizationId, r.journalEntries.id]
		}),
		organization: r.one.organization({
			from: r.journalLines.organizationId,
			to: r.organization.id
		}),
		supplier: r.one.suppliers({
			from: [r.journalLines.organizationId, r.journalLines.supplierId],
			to: [r.suppliers.organizationId, r.suppliers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.journalLines.updatedBy,
			to: r.user.id,
			alias: "journalLines_updatedBy_user_id"
		}),
	},
	member: {
		organization: r.one.organization({
			from: r.member.organizationId,
			to: r.organization.id
		}),
		user: r.one.user({
			from: r.member.userId,
			to: r.user.id
		}),
	},
	paymentAllocations: {
		purchaseBill: r.one.purchaseBills({
			from: [r.paymentAllocations.organizationId, r.paymentAllocations.purchaseBillId],
			to: [r.purchaseBills.organizationId, r.purchaseBills.id]
		}),
		userCreatedBy: r.one.user({
			from: r.paymentAllocations.createdBy,
			to: r.user.id,
			alias: "paymentAllocations_createdBy_user_id"
		}),
		businessInvoice: r.one.businessInvoices({
			from: [r.paymentAllocations.organizationId, r.paymentAllocations.invoiceId],
			to: [r.businessInvoices.organizationId, r.businessInvoices.id]
		}),
		organization: r.one.organization({
			from: r.paymentAllocations.organizationId,
			to: r.organization.id
		}),
		businessPayment: r.one.businessPayments({
			from: [r.paymentAllocations.organizationId, r.paymentAllocations.paymentId],
			to: [r.businessPayments.organizationId, r.businessPayments.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.paymentAllocations.updatedBy,
			to: r.user.id,
			alias: "paymentAllocations_updatedBy_user_id"
		}),
	},
	purchaseBills: {
		paymentAllocations: r.many.paymentAllocations(),
		purchaseBillItems: r.many.purchaseBillItems(),
		companyBranch: r.one.companyBranches({
			from: [r.purchaseBills.organizationId, r.purchaseBills.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.purchaseBills.createdBy,
			to: r.user.id,
			alias: "purchaseBills_createdBy_user_id"
		}),
		purchaseOrder: r.one.purchaseOrders({
			from: [r.purchaseBills.organizationId, r.purchaseBills.purchaseOrderId],
			to: [r.purchaseOrders.organizationId, r.purchaseOrders.id]
		}),
		organization: r.one.organization({
			from: r.purchaseBills.organizationId,
			to: r.organization.id
		}),
		supplier: r.one.suppliers({
			from: [r.purchaseBills.organizationId, r.purchaseBills.supplierId],
			to: [r.suppliers.organizationId, r.suppliers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.purchaseBills.updatedBy,
			to: r.user.id,
			alias: "purchaseBills_updatedBy_user_id"
		}),
	},
	priceListItems: {
		userCreatedBy: r.one.user({
			from: r.priceListItems.createdBy,
			to: r.user.id,
			alias: "priceListItems_createdBy_user_id"
		}),
		priceList: r.one.priceLists({
			from: [r.priceListItems.organizationId, r.priceListItems.priceListId],
			to: [r.priceLists.organizationId, r.priceLists.id]
		}),
		organization: r.one.organization({
			from: r.priceListItems.organizationId,
			to: r.organization.id
		}),
		product: r.one.products({
			from: [r.priceListItems.organizationId, r.priceListItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.priceListItems.organizationId, r.priceListItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.priceListItems.updatedBy,
			to: r.user.id,
			alias: "priceListItems_updatedBy_user_id"
		}),
	},
	productCategories: {
		userCreatedBy: r.one.user({
			from: r.productCategories.createdBy,
			to: r.user.id,
			alias: "productCategories_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.productCategories.organizationId,
			to: r.organization.id
		}),
		productCategory: r.one.productCategories({
			from: [r.productCategories.organizationId, r.productCategories.parentId],
			to: [r.productCategories.organizationId, r.productCategories.id],
			alias: "productCategories_organizationId_parentId_productCategories_organizationId_id"
		}),
		productCategories: r.many.productCategories({
			alias: "productCategories_organizationId_parentId_productCategories_organizationId_id"
		}),
		userUpdatedBy: r.one.user({
			from: r.productCategories.updatedBy,
			to: r.user.id,
			alias: "productCategories_updatedBy_user_id"
		}),
		products: r.many.products(),
		services: r.many.services(),
	},
	units: {
		products: r.many.products(),
		services: r.many.services(),
		userCreatedBy: r.one.user({
			from: r.units.createdBy,
			to: r.user.id,
			alias: "units_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.units.organizationId,
			to: r.organization.id
		}),
		userUpdatedBy: r.one.user({
			from: r.units.updatedBy,
			to: r.user.id,
			alias: "units_updatedBy_user_id"
		}),
	},
	purchaseBillItems: {
		userCreatedBy: r.one.user({
			from: r.purchaseBillItems.createdBy,
			to: r.user.id,
			alias: "purchaseBillItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.purchaseBillItems.organizationId,
			to: r.organization.id
		}),
		purchaseBill: r.one.purchaseBills({
			from: [r.purchaseBillItems.organizationId, r.purchaseBillItems.purchaseBillId],
			to: [r.purchaseBills.organizationId, r.purchaseBills.id]
		}),
		product: r.one.products({
			from: [r.purchaseBillItems.organizationId, r.purchaseBillItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.purchaseBillItems.organizationId, r.purchaseBillItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.purchaseBillItems.updatedBy,
			to: r.user.id,
			alias: "purchaseBillItems_updatedBy_user_id"
		}),
	},
	purchaseOrders: {
		purchaseBills: r.many.purchaseBills(),
		purchaseOrderItems: r.many.purchaseOrderItems(),
		companyBranch: r.one.companyBranches({
			from: [r.purchaseOrders.organizationId, r.purchaseOrders.branchId],
			to: [r.companyBranches.organizationId, r.companyBranches.id]
		}),
		userCreatedBy: r.one.user({
			from: r.purchaseOrders.createdBy,
			to: r.user.id,
			alias: "purchaseOrders_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.purchaseOrders.organizationId,
			to: r.organization.id
		}),
		supplier: r.one.suppliers({
			from: [r.purchaseOrders.organizationId, r.purchaseOrders.supplierId],
			to: [r.suppliers.organizationId, r.suppliers.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.purchaseOrders.updatedBy,
			to: r.user.id,
			alias: "purchaseOrders_updatedBy_user_id"
		}),
	},
	purchaseOrderItems: {
		userCreatedBy: r.one.user({
			from: r.purchaseOrderItems.createdBy,
			to: r.user.id,
			alias: "purchaseOrderItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.purchaseOrderItems.organizationId,
			to: r.organization.id
		}),
		purchaseOrder: r.one.purchaseOrders({
			from: [r.purchaseOrderItems.organizationId, r.purchaseOrderItems.purchaseOrderId],
			to: [r.purchaseOrders.organizationId, r.purchaseOrders.id]
		}),
		product: r.one.products({
			from: [r.purchaseOrderItems.organizationId, r.purchaseOrderItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.purchaseOrderItems.organizationId, r.purchaseOrderItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.purchaseOrderItems.updatedBy,
			to: r.user.id,
			alias: "purchaseOrderItems_updatedBy_user_id"
		}),
	},
	quotationItems: {
		userCreatedBy: r.one.user({
			from: r.quotationItems.createdBy,
			to: r.user.id,
			alias: "quotationItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.quotationItems.organizationId,
			to: r.organization.id
		}),
		quotation: r.one.quotations({
			from: [r.quotationItems.organizationId, r.quotationItems.quotationId],
			to: [r.quotations.organizationId, r.quotations.id]
		}),
		product: r.one.products({
			from: [r.quotationItems.organizationId, r.quotationItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.quotationItems.organizationId, r.quotationItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.quotationItems.updatedBy,
			to: r.user.id,
			alias: "quotationItems_updatedBy_user_id"
		}),
	},
	refunds: {
		account: r.one.accounts({
			from: [r.refunds.organizationId, r.refunds.accountId],
			to: [r.accounts.organizationId, r.accounts.id]
		}),
		userCreatedBy: r.one.user({
			from: r.refunds.createdBy,
			to: r.user.id,
			alias: "refunds_createdBy_user_id"
		}),
		creditNote: r.one.creditNotes({
			from: [r.refunds.organizationId, r.refunds.creditNoteId],
			to: [r.creditNotes.organizationId, r.creditNotes.id]
		}),
		customer: r.one.customers({
			from: [r.refunds.organizationId, r.refunds.customerId],
			to: [r.customers.organizationId, r.customers.id]
		}),
		organization: r.one.organization({
			from: r.refunds.organizationId,
			to: r.organization.id
		}),
		businessPayment: r.one.businessPayments({
			from: [r.refunds.organizationId, r.refunds.paymentId],
			to: [r.businessPayments.organizationId, r.businessPayments.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.refunds.updatedBy,
			to: r.user.id,
			alias: "refunds_updatedBy_user_id"
		}),
	},
	salesOrderItems: {
		userCreatedBy: r.one.user({
			from: r.salesOrderItems.createdBy,
			to: r.user.id,
			alias: "salesOrderItems_createdBy_user_id"
		}),
		organization: r.one.organization({
			from: r.salesOrderItems.organizationId,
			to: r.organization.id
		}),
		salesOrder: r.one.salesOrders({
			from: [r.salesOrderItems.organizationId, r.salesOrderItems.salesOrderId],
			to: [r.salesOrders.organizationId, r.salesOrders.id]
		}),
		product: r.one.products({
			from: [r.salesOrderItems.organizationId, r.salesOrderItems.productId],
			to: [r.products.organizationId, r.products.id]
		}),
		service: r.one.services({
			from: [r.salesOrderItems.organizationId, r.salesOrderItems.serviceId],
			to: [r.services.organizationId, r.services.id]
		}),
		userUpdatedBy: r.one.user({
			from: r.salesOrderItems.updatedBy,
			to: r.user.id,
			alias: "salesOrderItems_updatedBy_user_id"
		}),
	},
	session: {
		user: r.one.user({
			from: r.session.userId,
			to: r.user.id
		}),
	},
	subscriptionPayment: {
		organization: r.one.organization({
			from: r.subscriptionPayment.organizationId,
			to: r.organization.id
		}),
	},
}))