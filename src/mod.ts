import { DependencyContainer } from "tsyringe";

import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";

class Mod implements IPostDBLoadMod
{
    private databaseServer: DatabaseServer;
    private itemHelper: ItemHelper;

    private allItems: ITemplateItem[];

    private alreadyCheckedIDs: string[] = [];
    private invalidWeaponIDs: string[] = [];
    private invalidWeaponAttachmentIDs: string[] = [];
    private invalidEquipmentIDs: string[] = [];
    private invalidEquipmentAttachmentIDs: string[] = [];
    private uncategorizedIDs: string[] = [];

    public postDBLoad(container: DependencyContainer): void
    {
        this.databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        this.itemHelper = container.resolve<ItemHelper>("ItemHelper");
        this.allItems = Object.values(this.databaseServer.getTables().templates.items);

        // Categorized IDs
        this.getInvalidWeaponItemIDs();
        this.getInvalidWeaponAttachmentItemIDs();
        this.getInvalidEquipmentItemIDs();
        this.getInvalidEquipmentAttachmentItemIDs();

        // Everything that hasn't already been checked
        this.getOtherInvalidIDs();

        if (this.invalidWeaponIDs.length > 0) console.log(`${this.invalidWeaponIDs.length} invalid weapon IDs: ${JSON.stringify(this.invalidWeaponIDs)}`);
        if (this.invalidWeaponAttachmentIDs.length > 0) console.log(`${this.invalidWeaponAttachmentIDs.length} invalid weapon attachment IDs: ${JSON.stringify(this.invalidWeaponAttachmentIDs)}`);
        if (this.invalidEquipmentIDs.length > 0) console.log(`${this.invalidEquipmentIDs.length} invalid equipment IDs: ${JSON.stringify(this.invalidEquipmentIDs)}`);
        if (this.invalidEquipmentAttachmentIDs.length > 0) console.log(`${this.invalidEquipmentAttachmentIDs.length} invalid equipment attachment IDs: ${JSON.stringify(this.invalidEquipmentAttachmentIDs)}`);
        if (this.uncategorizedIDs.length > 0) console.log(`${this.uncategorizedIDs.length} remainder of extra invalid IDs: ${JSON.stringify(this.uncategorizedIDs)}`);

        console.log("Item Checking Complete");
    }

    private getInvalidWeaponItemIDs(): void
    {
        const weapons = this.allItems.filter(x => this.itemHelper.isOfBaseclass(x._id, BaseClasses.WEAPON));

        for (const weapon in weapons)
        {
            const weaponID = weapons[weapon]._id;

            if (this.alreadyCheckedIDs.includes(weaponID)) continue;
            this.alreadyCheckedIDs.push(weaponID);

            // If item doesn't exist in the database, but some mod is adding it to filters, add it to array and skip to next item
            if (!this.doesItemExist(weaponID, "weapon")) continue;
        }
    }

    private getInvalidWeaponAttachmentItemIDs(): void
    {
        const weapons = this.allItems.filter(x => this.itemHelper.isOfBaseclass(x._id, BaseClasses.WEAPON));

        for (const weapon in weapons)
        {
            const weaponSlots = weapons[weapon]?._props?.Slots;

            for (const slot in weaponSlots)
            {
                const slotName = weaponSlots[slot]?._name;
                const slotFilter = weaponSlots[slot]?._props?.filters[0]?.Filter

                // If filter has items
                if (slotFilter.length > 0)
                {
                    // Loop over all items in the filter for the slot
                    for (const item in slotFilter)
                    {
                        const slotFilterItem = slotFilter[item];

                        if (this.alreadyCheckedIDs.includes(slotFilterItem)) continue;                
                        this.alreadyCheckedIDs.push(slotFilterItem);

                        // If item doesn't exist in the database, but some mod is adding it to filters, add it to array and skip remainder of code
                        if (!this.doesItemExist(slotFilterItem, "weaponAttachment")) continue;

                        // Get Item Data now that we know it exists
                        const itemData = this.itemHelper.getItem(slotFilterItem)[1]

                        // Check is slot is a magazine, if it is, validate _max_count exists. If it doesn't - skip that incorrectly built attachment
                        if (slotName == "mod_magazine" && itemData?._props?.Cartridges[0]?._max_count == undefined)
                        {
                            if (!this.invalidWeaponAttachmentIDs.includes(slotFilterItem)) this.invalidWeaponAttachmentIDs.push(slotFilterItem);
                            console.log(`Invalid mod magazine, missing _max_count. Skipping. MagazineID: ${slotFilterItem}`);
                            continue;
                        }

                        this.recursiveItemCheck(itemData, "weaponAttachment");
                    }
                }
            }
        }
    }

    private getInvalidEquipmentItemIDs(): void
    {
        const allEquipment = this.allItems.filter(x => this.itemHelper.isOfBaseclass(x._id, BaseClasses.EQUIPMENT));

        for (const equipment in allEquipment)
        {
            const equipmentID = allEquipment[equipment]._id;

            if (this.alreadyCheckedIDs.includes(equipmentID)) continue;
            this.alreadyCheckedIDs.push(equipmentID);

            // If item doesn't exist in the database, but some mod is adding it to filters, add it to array and skip to next item
            if (!this.doesItemExist(equipmentID, "equipment")) continue;
        }
    }

    private getInvalidEquipmentAttachmentItemIDs(): void
    {
        const allEquipment = this.allItems.filter(x => this.itemHelper.isOfBaseclass(x._id, BaseClasses.EQUIPMENT));

        for (const equipment in allEquipment)
        {
            const equipmentSlots = allEquipment[equipment]?._props?.Slots;

            for (const slot in equipmentSlots)
            {
                const slotName = equipmentSlots[slot]?._name;
                const slotFilter = equipmentSlots[slot]?._props?.filters[0]?.Filter

                // If filter has items
                if (slotFilter.length > 0)
                {
                    // Loop over all items in the filter for the slot
                    for (const item in slotFilter)
                    {
                        const slotFilterItem = slotFilter[item];

                        if (this.alreadyCheckedIDs.includes(slotFilterItem)) continue;                
                        this.alreadyCheckedIDs.push(slotFilterItem);

                        // If item doesn't exist in the database, but some mod is adding it to filters, add it to array and skip remainder of code
                        if (!this.doesItemExist(slotFilterItem, "equipmentAttachment")) continue;

                        // Get Item Data now that we know it exists
                        const itemData = this.itemHelper.getItem(slotFilterItem)[1]

                        this.recursiveItemCheck(itemData, "equipmentAttachment");
                    }
                }
            }
        }
    }

    private recursiveItemCheck(itemData: ITemplateItem, type: string): void
    {
        const parentSlotItemID = itemData?._id;
        const parentSlotSlots = itemData?._props?.Slots;

        // Exit if there are no children
        if (parentSlotSlots == undefined || parentSlotSlots.length == 0) return;

        // Loop over all slots of the parent
        for (const slot in parentSlotSlots)
        {
            const slotName = parentSlotSlots[slot]?._name;
            const slotFilter = parentSlotSlots[slot]?._props?.filters[0]?.Filter;

            // Loop over each item in the slot's filters
            for (const item in slotFilter)
            {
                const slotFilterItem = parentSlotSlots[slot]?._props?.filters[0]?.Filter[item];  
                if (this.alreadyCheckedIDs.includes(slotFilterItem)) continue;

                this.alreadyCheckedIDs.push(slotFilterItem);

                // If item doesn't exist in the database, but some mod is adding it to filters, add it to array and skip item
                if (!this.doesItemExist(slotFilterItem, type)) continue;

                const itemData = this.itemHelper.getItem(slotFilterItem)[1]

                // Recheck item recursively
                this.recursiveItemCheck(itemData, type);
            }
        }
    }

    private getOtherInvalidIDs(): void
    {
        const items = this.allItems.filter(x => this.itemHelper.isOfBaseclass(x._id, BaseClasses.ITEM));

        for (const item in items)
        {
            const itemID = items[item]._id;

            if (this.alreadyCheckedIDs.includes(itemID)) continue;
            this.alreadyCheckedIDs.push(itemID);

            // If item doesn't exist in the database, but some mod is adding it to filters, add it to array and skip to next item
            if (!this.doesItemExist(itemID, "remainder")) continue;
        }
    }

    private doesItemExist(itemID: string, type: string): boolean
    {
        const itemExists = this.itemHelper.getItem(itemID)[0];
        
        if (!itemExists)
        {
            switch (type)
            {
                case "weapon":
                    if (!this.invalidWeaponIDs.includes(itemID)) this.invalidWeaponIDs.push(itemID);
                    break;
                case "weaponAttachment":
                    if (!this.invalidWeaponAttachmentIDs.includes(itemID)) this.invalidWeaponAttachmentIDs.push(itemID);
                    break;
                case "equipment":
                    if (!this.invalidEquipmentIDs.includes(itemID)) this.invalidEquipmentIDs.push(itemID);
                    break;
                case "equipmentAttachment":
                    if (!this.invalidEquipmentAttachmentIDs.includes(itemID)) this.invalidEquipmentAttachmentIDs.push(itemID);
                    break;
                case "remainder":
                    if (!this.uncategorizedIDs.includes(itemID)) this.uncategorizedIDs.push(itemID);
                    break;
                default:
                    console.log("Something broke...woops.")
                    break;
            }
        }
        return itemExists;
    }
}

export const mod = new Mod();
