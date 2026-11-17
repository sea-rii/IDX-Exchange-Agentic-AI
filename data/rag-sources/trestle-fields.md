# Trestle Field Definitions (RESO Data Dictionary)

Trestle (by CoreLogic, now Cotality) delivers MLS data mapped to the RESO Data Dictionary, the industry-standard set of field names. These definitions follow RESO Data Dictionary 2.0 (https://dd.reso.org/DD2.0/Property/), the standard Trestle is certified on. Field names are the RESO names, which california_sold uses almost entirely. rets_property uses RESO names for some fields (YearBuilt, AssociationFee, PoolPrivateYN, StandardStatus...) and IDX's own legacy names for its core fields (L_SystemPrice, L_Keyword2, LM_Dec_3, LM_Int2_3...), which are in the IDX Data Schema Reference instead. Note: rets_property has PhotoCount where RESO uses PhotosCount (the total number of photos included with the listing).

## Listing identifiers and status

### ListingKey

ListingKey (RESO standard field): A unique identifier for this record from the immediate source. In our data: california_sold.

### ListingId

ListingId (RESO standard field): The well-known identifier for the listing. In our data: not a column in either table.

### StandardStatus

StandardStatus (RESO standard field): The status of the listing as it reflects the state of the contract between the listing agent and seller (for example Active, Pending or Closed). In our data: rets_property.

### ModificationTimestamp

ModificationTimestamp (RESO standard field): The transactional timestamp automatically recorded by the MLS system representing the date/time the listing was last modified. In our data: rets_property.

## Prices

### ListPrice

ListPrice (RESO standard field): The current price of the property as determined by the seller and the seller's broker. In our data: california_sold.

### OriginalListPrice

OriginalListPrice (RESO standard field): The original price of the property on the initial agreement between the seller and the seller's broker. In our data: california_sold.

### PreviousListPrice

PreviousListPrice (RESO standard field): The most recent previous list price of the listing. In our data: rets_property.

### ClosePrice

ClosePrice (RESO standard field): The amount of money paid by the purchaser to the seller for the property under the agreement. In our data: california_sold.

## Dates and days on market

### DaysOnMarket (DOM)

DaysOnMarket (RESO standard field): DaysOnMarket, often shortened to DOM: the number of days the listing is on market, as defined by the MLS business rules. In our data: california_sold and rets_property.

### CumulativeDaysOnMarket (CDOM)

CumulativeDaysOnMarket (RESO standard field): CumulativeDaysOnMarket, often shortened to CDOM: the cumulative number of days the property is on market, as defined by the MLS business rules. In our data: not a column in either table.

### ListingContractDate

ListingContractDate (RESO standard field): The effective date of the agreement between the seller and the seller's broker. In our data: california_sold and rets_property.

### PurchaseContractDate

PurchaseContractDate (RESO standard field): With for-sale listings, this represents the date an offer was accepted and the listing was no longer on market. In our data: california_sold.

### CloseDate

CloseDate (RESO standard field): With for-sale listings, this is the date the purchase agreement was fulfilled. In our data: california_sold.

## Property type and size

### PropertyType

PropertyType (RESO standard field): The category of property, such as residential, lease, income, land, mobile, or commercial sale. In our data: california_sold.

### PropertySubType

PropertySubType (RESO standard field): The specific kind of property within a property type, such as single-family residence, condominium, or townhouse. In our data: california_sold.

### LivingArea

LivingArea (RESO standard field): The total livable area within the structure. In our data: california_sold.

### LotSizeAcres

LotSizeAcres (RESO standard field): The total acres of the lot. Related to Lot Size Area and Lot Size Units. In our data: california_sold and rets_property.

### LotSizeSquareFeet

LotSizeSquareFeet (RESO standard field): The total square footage of the lot. Related to Lot Size Area and Lot Size Units. In our data: california_sold and rets_property.

### BedroomsTotal

BedroomsTotal (RESO standard field): The total number of bedrooms in the dwelling. In our data: california_sold.

### BathroomsTotalInteger

BathroomsTotalInteger (RESO standard field): The simple sum of all bathrooms, for example two full baths plus one half bath. In our data: california_sold.

### MainLevelBedrooms

MainLevelBedrooms (RESO standard field): The number of bedrooms on the main or entry level of the property. In our data: california_sold.

### Stories

Stories (RESO standard field): The number of floors in the property being sold. In our data: california_sold.

### Levels

Levels (RESO standard field): The number of levels in the property being sold, such as One, Two, Three or More, or Multi/Split. In our data: california_sold.

### YearBuilt

YearBuilt (RESO standard field): The year an occupancy permit was first granted, or another local measure of initial habitability. In our data: california_sold and rets_property.

### NewConstructionYN

NewConstructionYN (RESO standard field): Flag indicating whether the property is newly constructed and has not been previously occupied. In our data: california_sold.

## Location

### UnparsedAddress

UnparsedAddress (RESO standard field): The full civic address as a single text entity, optionally including city, state, and other parts. In our data: california_sold.

### City

City (RESO standard field): The city named in the listing address. In our data: california_sold.

### StateOrProvince

StateOrProvince (RESO standard field): The accepted postal abbreviation for the state or province. In our data: california_sold.

### PostalCode

PostalCode (RESO standard field): The postal code portion of the street or mailing address. In our data: california_sold.

### CountyOrParish

CountyOrParish (RESO standard field): The county, parish, or other regional governing authority. In our data: rets_property.

### Latitude

Latitude (RESO standard field): The geographic latitude of a reference point on the property, in decimal degrees. In our data: california_sold.

### Longitude

Longitude (RESO standard field): The geographic longitude of a reference point on the property, in decimal degrees. In our data: california_sold.

### ParcelNumber

ParcelNumber (RESO standard field): A number that uniquely identifies a parcel or lot, typically issued by the county or assessor. In our data: rets_property.

### SubdivisionName

SubdivisionName (RESO standard field): The neighborhood, community, complex, or builder tract name. In our data: california_sold and rets_property.

### HighSchoolDistrict

HighSchoolDistrict (RESO standard field): The name of the high school district whose catchment area includes the property. In our data: california_sold.

### HighSchool

HighSchool (RESO standard field): The name of the high school whose catchment area includes the property. In our data: california_sold.

### MiddleOrJuniorSchool

MiddleOrJuniorSchool (RESO standard field): The name of the junior or middle school whose catchment area includes the property. In our data: california_sold.

## Features

### PoolPrivateYN

PoolPrivateYN (RESO standard field): The property has a privately owned pool that is included in the sale/lease. In our data: california_sold and rets_property.

### ViewYN

ViewYN (RESO standard field): The property has a view. In our data: california_sold and rets_property.

### View

View (RESO standard field): A view as seen from the listed property. In our data: rets_property.

### WaterfrontYN

WaterfrontYN (RESO standard field): The property is on a waterfront. In our data: california_sold.

### FireplaceYN

FireplaceYN (RESO standard field): Flag indicating whether the property has a fireplace. In our data: california_sold and rets_property.

### BasementYN

BasementYN (RESO standard field): Flag indicating whether the property has a basement. In our data: california_sold.

### AttachedGarageYN

AttachedGarageYN (RESO standard field): Flag indicating whether the garage is attached to the dwelling. In our data: california_sold.

### GarageSpaces

GarageSpaces (RESO standard field): The number of spaces in the garage(s). In our data: california_sold.

### ParkingTotal

ParkingTotal (RESO standard field): The total number of parking spaces included in the sale. In our data: california_sold.

### Cooling

Cooling (RESO standard field): A list describing the property's cooling or air conditioning features. In our data: rets_property.

### Heating

Heating (RESO standard field): A list describing the property's heating features. In our data: rets_property.

### ArchitecturalStyle

ArchitecturalStyle (RESO standard field): A list describing the structure's style, such as Victorian, Ranch, or Craftsman. In our data: rets_property.

## HOA

### AssociationFee

AssociationFee (RESO standard field): A fee paid by the homeowner to the homeowner association that is used for upkeep of common areas. In our data: california_sold and rets_property.

### AssociationAmenities

AssociationAmenities (RESO standard field): The amenities provided by the homeowner association, mobile park or complex (e.g., pool, clubhouse). In our data: rets_property.

## Agents and brokerages

### ListAgentFirstName

ListAgentFirstName (RESO standard field): The first name of the listing agent. In our data: california_sold.

### ListAgentLastName

ListAgentLastName (RESO standard field): The last name of the listing agent. In our data: california_sold.

### ListAgentFullName

ListAgentFullName (RESO standard field): The first, middle and last name of the listing agent. In our data: california_sold.

### ListAgentEmail

ListAgentEmail (RESO standard field): The email address of the listing agent. In our data: rets_property.

### ListAgentDirectPhone

ListAgentDirectPhone (RESO standard field): The direct phone number of the listing agent. North American 10-digit numbers use the format ###-###-####. In our data: rets_property.

### ListOfficeName

ListOfficeName (RESO standard field): The legal name of the brokerage representing the seller. In our data: california_sold.

### BuyerAgentFirstName

BuyerAgentFirstName (RESO standard field): The first name of the buyer's agent. In our data: california_sold.

### BuyerAgentLastName

BuyerAgentLastName (RESO standard field): The last name of the buyer's agent. In our data: california_sold.

### BuyerOfficeName

BuyerOfficeName (RESO standard field): The legal name of the brokerage representing the buyer. In our data: california_sold.
