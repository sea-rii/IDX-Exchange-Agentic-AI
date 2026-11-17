# IDX Data Schema Reference

Source: IDX Exchange AI Agentic Engineer Intern Handbook, Data Schema Reference (pages 4-5).

Both tables live in the same MySQL schema (boxgra5_cali). They are queried individually and joined via shared fields such as ListingKey / L_ListingID, city, postal code, and coordinates.

## How to join rets_property and california_sold (key join pattern)

To join rets_property (active listings) with california_sold (sold comps), match rets_property.L_ListingID to california_sold.ListingKey. L_ListingID is a VARCHAR and ListingKey is a BIGINT, so cast it first:

SELECT ... FROM rets_property r JOIN california_sold cs ON CAST(r.L_ListingID AS UNSIGNED) = cs.ListingKey

For market-level analysis, match on city and postal code instead (rets_property.L_City = california_sold.City and rets_property.L_Zip = california_sold.PostalCode).

## rets_property (active listings)

rets_property holds active listings. Many of its core search fields use IDX's own legacy names instead of RESO-standard names: L_SystemPrice is the list price, L_Keyword2 is bedrooms, LM_Dec_3 is bathrooms, LM_Int2_3 is square footage, L_City is the city and L_Address is the street address.

### rets_property.id

rets_property.id (INT PK): Auto-increment primary key.

### rets_property.L_ListingID

rets_property.L_ListingID (VARCHAR): MLS system listing ID — joins to california_sold.ListingKey.

### rets_property.L_DisplayId

rets_property.L_DisplayId (VARCHAR): Human-readable MLS number shown on portals.

### rets_property.L_Address

rets_property.L_Address (VARCHAR): Full street address.

### rets_property.L_City

rets_property.L_City (VARCHAR): City — indexed for fast city-based queries.

### rets_property.L_Zip

rets_property.L_Zip (VARCHAR): Postal code — indexed.

### rets_property.L_Class

rets_property.L_Class (VARCHAR): Property class: Residential, CommercialSale, Land, etc.

### rets_property.L_Type_

rets_property.L_Type_ (VARCHAR): Subtype: SingleFamilyResidence, Condominium, etc. — indexed.

### rets_property.L_Keyword2

rets_property.L_Keyword2 (INT): Bedrooms total.

### rets_property.LM_Dec_3

rets_property.LM_Dec_3 (DECIMAL(4,1)): Bathrooms total (supports half-baths e.g. 2.5).

### rets_property.L_SystemPrice

rets_property.L_SystemPrice (INT): Current list price (search/display price).

### rets_property.LM_Int2_3

rets_property.LM_Int2_3 (INT): Approximate finished square footage.

### rets_property.L_Keyword1

rets_property.L_Keyword1 (VARCHAR): Lot size (string, often in sq ft or acres).

### rets_property.LMD_MP_Latitude

rets_property.LMD_MP_Latitude (DECIMAL(18,15)): Geo latitude — high precision.

### rets_property.LMD_MP_Longitude

rets_property.LMD_MP_Longitude (DECIMAL(19,15)): Geo longitude — high precision.

### rets_property.L_Status

rets_property.L_Status (VARCHAR): Listing status: Active, Pending, Withdrawn, etc.

### rets_property.L_Remarks

rets_property.L_Remarks (MEDIUMTEXT): Full listing description — FULLTEXT indexed (ft_remarks).

### rets_property.L_Photos

rets_property.L_Photos (LONGTEXT): JSON array of Cotality/Trestle photo URLs.

### rets_property.LA1_UserFirstName

rets_property.LA1_UserFirstName (VARCHAR): Listing agent first name.

### rets_property.LA1_UserLastName

rets_property.LA1_UserLastName (VARCHAR): Listing agent last name.

### rets_property.ListAgentEmail

rets_property.ListAgentEmail (VARCHAR): Listing agent email address.

### rets_property.ListAgentDirectPhone

rets_property.ListAgentDirectPhone (VARCHAR): Listing agent direct phone.

### rets_property.LO1_OrganizationName

rets_property.LO1_OrganizationName (VARCHAR): Listing office / brokerage name.

### rets_property.ListingContractDate

rets_property.ListingContractDate (DATE): Date listing agreement was signed.

### rets_property.YearBuilt

rets_property.YearBuilt (INT): Year property was constructed.

### rets_property.SubdivisionName

rets_property.SubdivisionName (VARCHAR): Subdivision or community name.

### rets_property.AssociationFee

rets_property.AssociationFee (INT): Monthly HOA fee in dollars.

### rets_property.AssociationAmenities

rets_property.AssociationAmenities (TEXT): HOA amenities: Golf, Pool, Tennis, etc.

### rets_property.DaysOnMarket

rets_property.DaysOnMarket (INT): Days on market at time of data pull.

### rets_property.PoolPrivateYN

rets_property.PoolPrivateYN (VARCHAR): Private pool present (True/False).

### rets_property.FireplaceYN

rets_property.FireplaceYN (VARCHAR): Fireplace present (True/False).

### rets_property.ViewYN

rets_property.ViewYN (VARCHAR): Has a notable view (True/False).

### rets_property.View

rets_property.View (VARCHAR): View description: Mountains, Ocean, GolfCourse, etc.

### rets_property.LotSizeAcres

rets_property.LotSizeAcres (DECIMAL(10,4)): Lot size in acres.

### rets_property.LotSizeSquareFeet

rets_property.LotSizeSquareFeet (DECIMAL(14,2)): Lot size in square feet.

### rets_property.PreviousListPrice

rets_property.PreviousListPrice (DECIMAL(12,0)): Prior list price — enables price reduction analysis.

### rets_property.StandardStatus

rets_property.StandardStatus (VARCHAR): RESO standard status: Active, Pending, Closed.

### rets_property.CountyOrParish

rets_property.CountyOrParish (VARCHAR): County name (e.g., Riverside, Los Angeles).

### rets_property.ParcelNumber

rets_property.ParcelNumber (VARCHAR): Assessor parcel number (APN).

### rets_property.Cooling

rets_property.Cooling (VARCHAR): Cooling system type.

### rets_property.Heating

rets_property.Heating (VARCHAR): Heating system type.

### rets_property.ArchitecturalStyle

rets_property.ArchitecturalStyle (VARCHAR): Architectural style: Modern, Ranch, Mediterranean, etc.

### rets_property.PhotoCount

rets_property.PhotoCount (INT): Number of listing photos available.

### rets_property.ModificationTimestamp

rets_property.ModificationTimestamp (DATETIME): Last modification timestamp for incremental sync.

## california_sold (sold transactions)

california_sold holds sold (closed) transactions. Its columns use RESO-standard names, the same names as the Trestle documentation.

### california_sold.ListingKey

california_sold.ListingKey (BIGINT): Unique listing identifier — joins to rets_property.L_ListingID.

### california_sold.ClosePrice

california_sold.ClosePrice (DOUBLE): Final sale/close price.

### california_sold.CloseDate

california_sold.CloseDate (VARCHAR): Date the transaction closed (YYYY-MM-DD format).

### california_sold.OriginalListPrice

california_sold.OriginalListPrice (DOUBLE): Original asking price when first listed.

### california_sold.ListPrice

california_sold.ListPrice (DOUBLE): List price at time of contract.

### california_sold.DaysOnMarket

california_sold.DaysOnMarket (BIGINT): Days from listing to contract.

### california_sold.PropertyType

california_sold.PropertyType (VARCHAR): Residential, Land, ResidentialLease, CommercialSale, etc.

### california_sold.PropertySubType

california_sold.PropertySubType (VARCHAR): SingleFamilyResidence, Condominium, Duplex, etc.

### california_sold.LivingArea

california_sold.LivingArea (DOUBLE): Finished living area in square feet.

### california_sold.LotSizeAcres

california_sold.LotSizeAcres (DOUBLE): Lot size in acres.

### california_sold.LotSizeSquareFeet

california_sold.LotSizeSquareFeet (DOUBLE): Lot size in square feet.

### california_sold.BedroomsTotal

california_sold.BedroomsTotal (DOUBLE): Number of bedrooms.

### california_sold.BathroomsTotalInteger

california_sold.BathroomsTotalInteger (DOUBLE): Number of bathrooms.

### california_sold.YearBuilt

california_sold.YearBuilt (DOUBLE): Year property was built.

### california_sold.City

california_sold.City (VARCHAR): City of the property.

### california_sold.PostalCode

california_sold.PostalCode (VARCHAR): ZIP code.

### california_sold.Latitude

california_sold.Latitude (DOUBLE): Geographic latitude.

### california_sold.Longitude

california_sold.Longitude (DOUBLE): Geographic longitude.

### california_sold.UnparsedAddress

california_sold.UnparsedAddress (VARCHAR): Full street address.

### california_sold.ListAgentFirstName

california_sold.ListAgentFirstName (VARCHAR): List agent first name.

### california_sold.ListAgentLastName

california_sold.ListAgentLastName (VARCHAR): List agent last name.

### california_sold.ListAgentFullName

california_sold.ListAgentFullName (VARCHAR): List agent full name.

### california_sold.BuyerAgentFirstName

california_sold.BuyerAgentFirstName (VARCHAR): Buyer agent first name.

### california_sold.BuyerAgentLastName

california_sold.BuyerAgentLastName (VARCHAR): Buyer agent last name.

### california_sold.ListOfficeName

california_sold.ListOfficeName (VARCHAR): Listing brokerage name.

### california_sold.BuyerOfficeName

california_sold.BuyerOfficeName (VARCHAR): Buyer brokerage name.

### california_sold.PoolPrivateYN

california_sold.PoolPrivateYN (VARCHAR): Private pool (True/False/empty).

### california_sold.ViewYN

california_sold.ViewYN (VARCHAR): Has view (True/False/empty).

### california_sold.FireplaceYN

california_sold.FireplaceYN (VARCHAR): Has fireplace (True/False/empty).

### california_sold.NewConstructionYN

california_sold.NewConstructionYN (VARCHAR): New construction (True/False).

### california_sold.GarageSpaces

california_sold.GarageSpaces (DOUBLE): Number of garage spaces.

### california_sold.AssociationFee

california_sold.AssociationFee (DOUBLE): Monthly HOA fee.

### california_sold.SubdivisionName

california_sold.SubdivisionName (VARCHAR): Subdivision / community name.

### california_sold.HighSchoolDistrict

california_sold.HighSchoolDistrict (VARCHAR): School district name.

### california_sold.ListingContractDate

california_sold.ListingContractDate (VARCHAR): Date listing was entered (YYYY-MM-DD).

### california_sold.PurchaseContractDate

california_sold.PurchaseContractDate (VARCHAR): Date offer was accepted.
