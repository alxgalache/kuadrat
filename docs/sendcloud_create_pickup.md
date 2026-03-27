> ## Documentation Index
> Fetch the complete documentation index at: https://sendcloud.dev/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a pickup

> Schedule a one-time pickup with a supported carrier.

This endpoint allows you to schedule a pickup with one of the [supported carriers](/api/v3/pickups#which-carriers-support-pickups-via-the-api).

Schedule a pickup time and choose a location, and include any additional instructions to the driver by including the `special_instructions` parameter. Once a pickup is successfully scheduled, a pickup `id` will be returned.

<Warning>
  If you have more than one active contract for the carrier, you must include the `contract` field with your desired contract ID in your request. You can get your contract ID from the [Retrieve a list of contracts](/api/v3/contracts/retrieve-a-list-of-contracts) endpoint.
</Warning>

## OpenAPI

````yaml /.openapi/v3/pickups/openapi.yaml post /pickups
openapi: 3.1.0
info:
  title: Pickups API
  version: 3.0.0
  contact:
    name: Sendcloud API Support
    url: https://www.sendcloud.dev
    email: contact@sendcloud.com
  description: >-
    The Pickups API lets you schedule a one-time parcel pickup with supported
    carriers.
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html
servers:
  - url: https://panel.sendcloud.sc/api/v3
    description: Sendcloud Production
security: []
tags:
  - name: Pickups
    description: >-
      The pickup is a delivery option when a carrier collects parcels at a
      specific address and time, and then delivers them to the sorting center.
paths:
  /pickups:
    post:
      tags:
        - Pickups
      summary: Create a pickup
      description: Schedule a one-time pickup with a supported carrier.
      operationId: sc-public-v3-scp-post-pickup
      requestBody:
        content:
          application/json:
            schema:
              oneOf:
                - $ref: '#/components/schemas/brt-pickup-request'
                - $ref: '#/components/schemas/correos-pickup-request'
                - $ref: '#/components/schemas/correos-express-pickup-request'
                - $ref: '#/components/schemas/dhl-pickup-request'
                - $ref: '#/components/schemas/dpd-at-pickup-request'
                - $ref: '#/components/schemas/dhl-de-pickup-request'
                - $ref: '#/components/schemas/dhl-express-pickup-request'
                - $ref: '#/components/schemas/dhl-parcel-iberia-pickup-request'
                - $ref: '#/components/schemas/dhl-parcel-gb-pickup-request'
                - $ref: '#/components/schemas/dpd-pickup-request'
                - $ref: '#/components/schemas/fedex-request'
                - $ref: '#/components/schemas/gls-it-request'
                - $ref: '#/components/schemas/hermes-de-pickup-request'
                - $ref: '#/components/schemas/poste-it-delivery-pickup-request'
                - $ref: '#/components/schemas/ups-pickup-request'
              discriminator:
                propertyName: carrier_code
                mapping:
                  brt:
                    $ref: '#/components/schemas/brt-pickup-request'
                  correos:
                    $ref: '#/components/schemas/correos-pickup-request'
                  correos_express:
                    $ref: '#/components/schemas/correos-express-pickup-request'
                  dhl:
                    $ref: '#/components/schemas/dhl-pickup-request'
                  dpd_at:
                    $ref: '#/components/schemas/dpd-at-pickup-request'
                  dhl_de:
                    $ref: '#/components/schemas/dhl-de-pickup-request'
                  dhl_express:
                    $ref: '#/components/schemas/dhl-express-pickup-request'
                  dhl_parcel_iberia:
                    $ref: '#/components/schemas/dhl-parcel-iberia-pickup-request'
                  dhl_parcel_gb:
                    $ref: '#/components/schemas/dhl-parcel-gb-pickup-request'
                  dpd:
                    $ref: '#/components/schemas/dpd-pickup-request'
                  fedex:
                    $ref: '#/components/schemas/fedex-request'
                  gls_it:
                    $ref: '#/components/schemas/gls-it-request'
                  hermes_de:
                    $ref: '#/components/schemas/hermes-de-pickup-request'
                  poste_it_delivery:
                    $ref: '#/components/schemas/poste-it-delivery-pickup-request'
                  ups:
                    $ref: '#/components/schemas/ups-pickup-request'
            examples:
              DHLExpressPickupRequest:
                summary: DHL Express pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: NL
                    city: Eindhoven
                    email: example@sendcloud.com
                    address_line_1: Stadhuisplein
                    house_number: '10'
                    address_line_2: ''
                    postal_code: 5611 EM
                    phone_number: '+310612345678'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: dhl_express
              CorreosExpressPickupRequest:
                summary: Correos Express pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: ES
                    city: Madrid
                    email: example@sendcloud.com
                    address_line_1: Calle de Dinero
                    house_number: '30'
                    address_line_2: ''
                    postal_code: '28002'
                    phone_number: '+310638404040'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: correos_express
              CorreosPickupRequest:
                summary: Correos pickup request
                value:
                  reference: '123456'
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: ES
                    city: Madrid
                    email: example@sendcloud.com
                    address_line_1: Calle de Dinero
                    house_number: '30'
                    address_line_2: ''
                    postal_code: '28002'
                    phone_number: '+310638404040'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                      volumetric_weight_kind: small
                  carrier_code: correos
              PosteItDeliveryPickupRequest:
                summary: Poste Italiane Delivery pickup request
                value:
                  reference: '123456'
                  address:
                    name: John Doe
                    city: Roma
                    country_code: IT
                    state_province_code: IT-RM
                    address_line_1: Via Domenico Jachino
                    house_number: '67'
                    address_line_2: ''
                    postal_code: '00144'
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '+3912123732'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: poste_it_delivery
              GlsItPickupRequest:
                summary: GLS Italy pickup request
                value:
                  reference: '123456'
                  address:
                    name: John Doe
                    city: Roma
                    country_code: IT
                    state_province_code: IT-RM
                    address_line_1: Via Domenico Jachino
                    house_number: '67'
                    address_line_2: ''
                    postal_code: '00144'
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '+3912123732'
                  time_slots:
                    - start_at: '2022-04-10T09:00:00Z'
                      end_at: '2022-04-10T12:00:00Z'
                    - start_at: '2022-04-10T14:00:00Z'
                      end_at: '2022-04-10T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: gls_it
              FedexPickupRequest:
                summary: Fedex pickup request
                value:
                  address:
                    name: John Doe
                    city: Madrid
                    country_code: ES
                    address_line_1: Calle de Dinero
                    house_number: '30'
                    address_line_2: ''
                    postal_code: '28001'
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '0638404040'
                  carrier_code: fedex
                  origin_detail:
                    package_location: front
                    building_part: apartment
                    building_part_description: some description
                    company_close_time: '17:00:00'
              DhlParcelIberiaPickupRequest:
                summary: DHL Parcel Iberia pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: PT
                    city: Porto
                    email: example@sendcloud.com
                    address_line_1: Rue de Justino Teixeira
                    house_number: '640'
                    address_line_2: ''
                    postal_code: 3300-277
                    phone_number: '+310638404040'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: dhe_parcel_iberia
              UPSPickupRequest:
                summary: UPS pickup request
                value:
                  reference: '123456'
                  address:
                    name: John Doe
                    city: London
                    country_code: GB
                    address_line_1: Oxford Street
                    house_number: '1'
                    address_line_2: ''
                    postal_code: W1D 1NN
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '+3912123732'
                    room: 22B
                    floor: '1'
                    is_alternate_address: true
                    is_residential: false
                  items:
                    - quantity: 2
                      shipping_option: express
                      container_type: parcel
                      destination_country_code: GB
                    - quantity: 1
                      shipping_option: standard
                      container_type: pallet
                      destination_country_code: NL
                  is_overweight: false
                  time_slots:
                    - start_at: '2022-04-10T13:00:00Z'
                      end_at: '2022-04-10T15:00:00Z'
                  total_weight:
                    value: '1.00'
                    unit: kg
                  carrier_code: ups
              HermesGermanyPickupRequest:
                summary: Hermes Germany pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: NL
                    city: Eindhoven
                    email: example@sendcloud.com
                    address_line_1: Stadhuisplein
                    house_number: '10'
                    address_line_2: ''
                    postal_code: 5611 EM
                    phone_number: '+310612345678'
                  time_slots:
                    - start_at: '2022-04-06T09:00:00Z'
                      end_at: '2022-04-06T12:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: hermes_de
              DHLPickupRequest:
                summary: DHL pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: NL
                    city: Eindhoven
                    email: example@sendcloud.com
                    address_line_1: Stadhuisplein
                    house_number: '10'
                    address_line_2: ''
                    postal_code: 5611 EM
                    phone_number: '+310612345678'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                    - quantity: 2
                      container_type: pallet
                      total_weight:
                        value: '10.00'
                        unit: kg
                  carrier_code: dhl
              DHLParcelGBPickupRequest:
                summary: DHL Parcel GB pickup request
                value:
                  reference: '123456'
                  address:
                    name: John Doe
                    city: London
                    country_code: GB
                    address_line_1: Oxford Street
                    house_number: '1'
                    address_line_2: ''
                    postal_code: W1D 1NN
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '+3912123732'
                    room: 22B
                    floor: '1'
                    is_alternate_address: true
                    is_residential: false
                  is_overweight: false
                  time_slots:
                    - start_at: '2022-04-10T13:00:00Z'
                      end_at: '2022-04-10T15:00:00Z'
                  total_weight:
                    value: '1.00'
                    unit: kg
                  customer_account_number: '12345'
                  trading_location_id: XYZ123456
                  carrier_code: dhl_parcel_gb
              BRTPickupRequest:
                summary: BRT pickup request
                value:
                  reference: '123456'
                  address:
                    name: John Doe
                    city: Roma
                    country_code: IT
                    state_province_code: IT-RM
                    address_line_1: Via Domenico Jachino
                    house_number: '67'
                    address_line_2: ''
                    postal_code: '00144'
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '+3912123732'
                  time_slots:
                    - start_at: '2022-04-10T09:00:00Z'
                      end_at: '2022-04-10T12:00:00Z'
                    - start_at: '2022-04-10T14:00:00Z'
                      end_at: '2022-04-10T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: brt
              DPDPickupRequest:
                summary: DPD pickup request
                value:
                  address:
                    name: John Doe
                    city: Berlin
                    country_code: DE
                    address_line_1: Hannoversche Str.
                    house_number: 5B
                    address_line_2: ''
                    postal_code: '10115'
                    company_name: Sendcloud
                    email: example@sendcloud.com
                    phone_number: '+4975327149698'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 20
                      container_type: parcel
                      total_weight:
                        value: '1.00'
                        unit: kg
                  carrier_code: dpd
              DPDATPickupRequest:
                summary: DPD AT pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: NL
                    city: Eindhoven
                    email: example@sendcloud.com
                    address_line_1: Stadhuisplein
                    address_line_2: ''
                    postal_code: 5611 EM
                    phone_number: '+310612345678'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 5
                      total_weight:
                        value: '2.00'
                        unit: kg
                  carrier_code: dpd_at
                  reference: ''
                  special_instructions: ''
              DHLDEPickupRequest:
                summary: DHL DE pickup request
                value:
                  address:
                    name: John Doe
                    company_name: Sendcloud
                    country_code: NL
                    city: Eindhoven
                    email: example@sendcloud.com
                    address_line_1: Stadhuisplein
                    house_number: '10'
                    address_line_2: ''
                    postal_code: 5611 EM
                    phone_number: '+310612345678'
                  time_slots:
                    - start_at: '2022-04-06T12:00:00Z'
                      end_at: '2022-04-06T17:00:00Z'
                  items:
                    - quantity: 5
                      total_weight:
                        value: '2.00'
                        unit: kg
                  carrier_code: dhl_de
                  reference: ''
                  special_instructions: ''
        description: ''
      responses:
        '201':
          description: >-
            Created - This means that the data is send to the carrier
            successfully, to see if the carrier accepted the pickup request
            check the status of the pickup via the GET endpoint.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    oneOf:
                      - $ref: '#/components/schemas/brt-pickup-response'
                      - $ref: '#/components/schemas/correos-express-pickup-response'
                      - $ref: '#/components/schemas/correos-pickup-response'
                      - $ref: '#/components/schemas/dhl-de-pickup-response'
                      - $ref: '#/components/schemas/dhl-express-pickup-response'
                      - $ref: '#/components/schemas/dhl-parcel-gb-pickup-response'
                      - $ref: '#/components/schemas/dhl-parcel-iberia-pickup-response'
                      - $ref: '#/components/schemas/dhl-pickup-response'
                      - $ref: '#/components/schemas/dpd-at-pickup-response'
                      - $ref: '#/components/schemas/dpd-pickup-response'
                      - $ref: '#/components/schemas/fedex-response'
                      - $ref: '#/components/schemas/gls-it-response'
                      - $ref: '#/components/schemas/hermes-de-pickup-response'
                      - $ref: '#/components/schemas/poste-it-delivery-pickup-response'
                      - $ref: '#/components/schemas/ups-pickup-response'
                    discriminator:
                      propertyName: carrier_code
                      mapping:
                        brt:
                          $ref: '#/components/schemas/brt-pickup-response'
                        correos:
                          $ref: '#/components/schemas/correos-pickup-response'
                        correos_express:
                          $ref: '#/components/schemas/correos-express-pickup-response'
                        dhl:
                          $ref: '#/components/schemas/dhl-pickup-response'
                        dhl_de:
                          $ref: '#/components/schemas/dhl-de-pickup-response'
                        dhl_express:
                          $ref: '#/components/schemas/dhl-express-pickup-response'
                        dhl_parcel_gb:
                          $ref: '#/components/schemas/dhl-parcel-gb-pickup-response'
                        dhl_parcel_iberia:
                          $ref: >-
                            #/components/schemas/dhl-parcel-iberia-pickup-response
                        dpd:
                          $ref: '#/components/schemas/dpd-pickup-response'
                        dpd_at:
                          $ref: '#/components/schemas/dpd-at-pickup-response'
                        fedex:
                          $ref: '#/components/schemas/fedex-response'
                        gls_it:
                          $ref: '#/components/schemas/gls-it-response'
                        hermes_de:
                          $ref: '#/components/schemas/hermes-de-pickup-response'
                        poste_it_delivery:
                          $ref: >-
                            #/components/schemas/poste-it-delivery-pickup-response
                        ups:
                          $ref: '#/components/schemas/ups-pickup-response'
              examples:
                SuccessfullyCreatedDHLExpressPickup:
                  summary: Successfully created a DHL Express pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: NL
                        city: Eindhoven
                        email: example@sendcloud.com
                        address_line_1: Stadhuisplein
                        house_number: '10'
                        address_line_2: ''
                        postal_code: 5611 EM
                        phone_number: '+310612345678'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: ''
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: dhl_express
                      contract_id: 10
                SuccessfullyCreatedCorreosExpressPickup:
                  summary: Successfully created a Correos Express pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: ES
                        city: Madrid
                        email: example@sendcloud.com
                        address_line_1: Calle de Dinero
                        house_number: '30'
                        address_line_2: ''
                        postal_code: '28002'
                        phone_number: '+310638404040'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: ''
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: correos_express
                      contract_id: 10
                SuccessfullyCreatedCorreosPickup:
                  summary: Successfully created a Correos pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: ES
                        city: Madrid
                        email: example@sendcloud.com
                        address_line_1: Calle de Dinero
                        house_number: '30'
                        address_line_2: ''
                        postal_code: '28002'
                        phone_number: '+310638404040'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: '123456'
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: correos
                      contract_id: 10
                SuccessfullyCreatedPosteItDeliveryPickup:
                  summary: Successfully created a Poste Italiane Delivery pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        city: Roma
                        country_code: IT
                        state_province_code: IT-RM
                        address_line_1: Via Domenico Jachino
                        house_number: '67'
                        address_line_2: ''
                        postal_code: '00144'
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '+3912123732'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: '123456'
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: poste_it_delivery
                      contract_id: 10
                SuccessfullyCreatedGlsItDeliveryPickup:
                  summary: Successfully created a GLS Italy pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        city: Roma
                        country_code: IT
                        state_province_code: IT-RM
                        address_line_1: Via Domenico Jachino
                        house_number: '67'
                        address_line_2: ''
                        postal_code: '00144'
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '+3912123732'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: '123456'
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: gls_it
                      contract_id: 10
                SuccessfullyCreatedFedexPickup:
                  summary: Successfully created a Fedex pickup
                  value:
                    data:
                      id: 1
                      address:
                        name: John Doe
                        city: Madrid
                        country_code: ES
                        address_line_1: Calle de Dinero
                        house_number: '30'
                        address_line_2: ''
                        postal_code: '28001'
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '0638404040'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: ''
                      cancelled_at: null
                      carrier_code: fedex
                      contract_id: 10
                      origin_detail:
                        package_location: front
                        building_part: apartment
                        building_part_description: some description
                        company_close_time: '17:00:00'
                SuccessfullyCreatedDhlParcelIberiaPickup:
                  summary: Successfully created a DHL Parcel Iberia pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: PT
                        city: Porto
                        email: example@sendcloud.com
                        address_line_1: Rua de Justino Teixeira
                        house_number: '640'
                        address_line_2: ''
                        postal_code: 3000-277
                        phone_number: '+310638404040'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: ''
                      cancelled_at: null
                      carrier_code: dhe_parcel_iberia
                      contract_id: 10
                SuccessfullyCreatedUPSPickup:
                  summary: Successfully created an UPS pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        city: London
                        country_code: GB
                        address_line_1: Oxford Street
                        house_number: '1'
                        address_line_2: ''
                        postal_code: W1D 1NN
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '+3912123732'
                      items:
                        - quantity: 2
                          shipping_option: express
                          container_type: parcel
                          destination_country_code: GB
                        - quantity: 1
                          shipping_option: standard
                          container_type: pallet
                          destination_country_code: NL
                      time_slots:
                        - start_at: '2022-04-10T13:00:00Z'
                          end_at: '2022-04-10T15:00:00Z'
                      reference: '123456'
                      special_instructions: ''
                      total_weight:
                        value: '1.00'
                        unit: kg
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: ups
                      contract_id: 10
                SuccessfullyCreatedHermesGermanyPickup:
                  summary: Successfully created a Hermes Germany pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: NL
                        city: Eindhoven
                        email: example@sendcloud.com
                        address_line_1: Stadhuisplein
                        house_number: '10'
                        address_line_2: ''
                        postal_code: 5611 EM
                        phone_number: '+310612345678'
                      time_slots:
                        - start_at: '2022-04-06T09:00:00Z'
                          end_at: '2022-04-06T12:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: ''
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: hermes_de
                      contract_id: 10
                SuccessfullyCreatedDHLPickup:
                  summary: Successfully created a DHL pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: NL
                        city: Eindhoven
                        email: example@sendcloud.com
                        address_line_1: Stadhuisplein
                        house_number: '10'
                        address_line_2: ''
                        postal_code: 5611 EM
                        phone_number: '+310612345678'
                      time_slots:
                        - start_at: '2022-04-06T09:00:00Z'
                          end_at: '2022-04-06T12:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      pallet_quantity: 1
                      reference: ''
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: dhl
                      contract_id: 10
                SuccessfullyCreatedDPDATPickup:
                  summary: Successfully created a DPD AT pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        company_name: Sendcloud
                        country_code: NL
                        city: Eindhoven
                        email: example@sendcloud.com
                        address_line_1: Stadhuisplein
                        house_number: '10'
                        address_line_2: ''
                        postal_code: 5611 EM
                        phone_number: '+310612345678'
                      time_slots:
                        - start_at: '2022-04-06T09:00:00Z'
                          end_at: '2022-04-06T12:00:00Z'
                      items:
                        - quantity: 1
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      pallet_quantity: 1
                      reference: ''
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: dpd_at
                      contract_id: 10
                SuccessfullyCreatedDHLParcelGBPickup:
                  summary: Successfully created an DHL Parcel GB pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        city: London
                        country_code: GB
                        address_line_1: Oxford Street
                        house_number: '1'
                        address_line_2: ''
                        postal_code: W1D 1NN
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '+3912123732'
                      time_slots:
                        - start_at: '2022-04-10T13:00:00Z'
                          end_at: '2022-04-10T15:00:00Z'
                      reference: '123456'
                      special_instructions: ''
                      total_weight:
                        value: '1.00'
                        unit: kg
                      customer_account_number: '12345'
                      trading_location_id: XYZ123456
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: dhl_parcel_gb
                      contract_id: 10
                SuccessfullyCreatedBRTPickup:
                  summary: Successfully created a BRT pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        city: Roma
                        country_code: IT
                        state_province_code: IT-RM
                        address_line_1: Via Domenico Jachino
                        house_number: '67'
                        address_line_2: ''
                        postal_code: '00144'
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '+3912123732'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: '123456'
                      special_instructions: ''
                      tracking_number: ''
                      status: ANNOUNCING
                      created_at: '2022-03-30T09:20:37.957495Z'
                      cancelled_at: null
                      carrier_code: brt
                      contract_id: 10
                SuccessfullyCreatedDPDPickup:
                  summary: Successfully created a DPD pickup
                  value:
                    data:
                      id: 294247
                      address:
                        name: John Doe
                        city: Berlin
                        country_code: DE
                        address_line_1: Hannoversche Str.
                        house_number: 5B
                        address_line_2: ''
                        postal_code: 10115
                        company_name: Sendcloud
                        email: example@sendcloud.com
                        phone_number: '+4975327149698'
                      time_slots:
                        - start_at: '2022-04-06T12:00:00Z'
                          end_at: '2022-04-06T17:00:00Z'
                      items:
                        - quantity: 20
                          container_type: parcel
                          total_weight:
                            value: '1.00'
                            unit: kg
                      reference: ''
                      cancelled_at: null
                      carrier_code: dhe_parcel_iberia
                      contract_id: 10
        '400':
          description: Bad request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/errors'
              examples:
                RequiredField:
                  summary: Missing required field response
                  value:
                    errors:
                      - status: '400'
                        code: validation_error
                        detail: >-
                          Decimal input should be an integer, float, string or
                          Decimal object
                        source:
                          pointer: /data/total_weight
      security:
        - HTTPBasicAuth: []
        - OAuth2ClientCreds: []
components:
  schemas:
    brt-pickup-request:
      title: BRT Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - brt
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-state-province-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: >
                Scheduled time slots for the pickup. One or two time slots can
                be defined, one for the morning and one for the afternoon.
              minItems: 1
              maxItems: 2
    correos-pickup-request:
      title: Correos Express Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - correos
              description: Pickup carrier code selected by the user.
            reference:
              type: string
              description: Reference number for your administration.
              minLength: 1
            items:
              type: array
              items:
                $ref: '#/components/schemas/correos-pickup-item'
                description: Items to be picked up.
    correos-express-pickup-request:
      title: Correos Express Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - correos_express
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    dhl-pickup-request:
      title: DHL Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
            items:
              type: array
              items:
                $ref: '#/components/schemas/dhl-pickup-item'
                description: Items to be picked up.
    dpd-at-pickup-request:
      title: DPD AT Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dpd_at
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
            items:
              type: array
              items:
                $ref: '#/components/schemas/dpd-at-pickup-item'
                description: Items to be picked up.
    dhl-de-pickup-request:
      title: DHL DE Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_de
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
            items:
              type: array
              items:
                $ref: '#/components/schemas/dhl-de-pickup-item'
                description: Items to be picked up.
    dhl-express-pickup-request:
      title: DHL Express Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_express
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
    dhl-parcel-iberia-pickup-request:
      title: DHL Parcel Iberia Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_parcel_iberia
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    dhl-parcel-gb-pickup-request:
      title: DHL Parcel GB Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_parcel_gb
              description: Pickup carrier code selected by the user.
            customer_account_number:
              description: Customer number (CUS)
              type: string
            trading_location_id:
              description: Unique ID for customer trading location
              type: string
      required:
        - time_slots
        - quantity
        - total_weight
        - carrier_code
        - address
        - customer_account_number
        - trading_location_id
    dpd-pickup-request:
      title: DPD Pickup Request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - dpd
              description: Pickup carrier code selected by the user.
    fedex-request:
      title: Fedex Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - fedex
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            origin_detail:
              $ref: '#/components/schemas/fedex-origin-detail'
      required:
        - time_slots
        - quantity
        - total_weight
        - carrier_code
        - address
        - origin_detail
    gls-it-request:
      title: GLS Italy Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - gls_it
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-state-province-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: >
                Scheduled time slots for the pickup. One or two time slots can
                be defined, one for the morning and one for the afternoon.
              minItems: 1
              maxItems: 2
    hermes-de-pickup-request:
      title: Hermes Germany Pickup Request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - type: object
          properties:
            carrier_code:
              type: string
              enum:
                - hermes_de
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    poste-it-delivery-pickup-request:
      title: Poste Italiane Delivery Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - poste_it_delivery
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-state-province-required'
              description: Pickup address information.
    ups-pickup-request:
      title: UPS Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - ups
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
            address:
              $ref: '#/components/schemas/ups-pickup-address'
              description: Pickup address information.
            items:
              type: array
              items:
                $ref: '#/components/schemas/ups-pickup-item'
                description: Items to be picked up.
            is_overweight:
              type: boolean
              example: true
              default: false
              description: Indicates if at least any package is over 70 lbs or 32 kgs.
      required:
        - time_slots
        - total_weight
        - carrier_code
        - address
    brt-pickup-response:
      title: BRT Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-request'
        - properties:
            carrier_code:
              type: string
              enum:
                - brt
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-state-province-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    correos-express-pickup-response:
      title: Correos Express Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - correos_express
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    correos-pickup-response:
      title: Correos Express Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - correos
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
    dhl-de-pickup-response:
      title: DHL Germany Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_de
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list'
              description: Scheduled time slot for the pickup.
            items:
              type: array
              items:
                $ref: '#/components/schemas/dhl-de-pickup-item'
                description: Items to be picked up.
    dhl-express-pickup-response:
      title: DHL Express Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_express
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    dhl-parcel-gb-pickup-response:
      title: DHL Parcel GB Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_parcel_gb
              description: Pickup carrier code selected by the user.
    dhl-parcel-iberia-pickup-response:
      title: DHL Parcel Iberia Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl_parcel_iberia
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    dhl-pickup-response:
      title: DHL Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dhl
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
            items:
              type: array
              items:
                $ref: '#/components/schemas/dhl-pickup-item'
                description: Items to be picked up.
    dpd-at-pickup-response:
      title: DPD AT Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dpd_at
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: Scheduled time slot for the pickup.
            items:
              type: array
              items:
                $ref: '#/components/schemas/dpd-at-pickup-item'
                description: Items to be picked up.
    dpd-pickup-response:
      title: DPD Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - dpd
              description: Pickup carrier code selected by the user.
    fedex-response:
      title: Fedex Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - fedex
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            origin_detail:
              $ref: '#/components/schemas/fedex-origin-detail'
    gls-it-response:
      title: GLS Italy Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - gls_it
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-state-province-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
              description: >
                Scheduled time slots for the pickup. One or two time slots can
                be defined, one for the morning and one for the afternoon.
              minItems: 1
              maxItems: 2
    hermes-de-pickup-response:
      title: Hermes Germany Pickup Response
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - type: object
          properties:
            carrier_code:
              type: string
              enum:
                - hermes_de
              description: Pickup carrier code selected by the user.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
    poste-it-delivery-pickup-response:
      title: Poste Italiane Delivery Pickup request
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - poste_it_delivery
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-state-province-required'
              description: Pickup address information.
    ups-pickup-response:
      title: UPS Pickup Object
      type: object
      allOf:
        - $ref: '#/components/schemas/base-pickup-response'
        - properties:
            carrier_code:
              type: string
              enum:
                - ups
              description: Pickup carrier code selected by the user.
            address:
              $ref: '#/components/schemas/pickup-address-phone-number-required'
              description: Pickup address information.
            time_slots:
              $ref: '#/components/schemas/time-slot-list-end-at-required'
            items:
              type: array
              items:
                $ref: '#/components/schemas/ups-pickup-item'
                description: Items to be picked up.
    errors:
      title: Errors
      type: object
      description: A standardized format for errors in JSON:API responses.
      properties:
        errors:
          type:
            - array
            - object
          items:
            type: object
            allOf:
              - $ref: '#/components/schemas/ErrorObject'
            required:
              - status
              - code
              - detail
    base-pickup-request:
      title: Base Pickup request
      type: object
      properties:
        time_slots:
          $ref: '#/components/schemas/time-slot-list'
          minItems: 1
          maxItems: 1
        items:
          type: array
          items:
            $ref: '#/components/schemas/base-pickup-item'
          description: Items scheduled to be picked up.
          minItems: 1
        reference:
          type: string
          description: Reference number for your administration.
          minLength: 0
        special_instructions:
          type: string
          description: Special instructions for the pickup driver.
        carrier_code:
          type: string
          example: dhl_express
          description: Pickup carrier code selected by the user.
        contract_id:
          type:
            - integer
            - 'null'
          description: Contract ID you want to use for the pickup request.
        quantity:
          type: integer
          minimum: 1
          description: Number of parcels to pick up.
        total_weight:
          $ref: '#/components/schemas/str-weight'
          description: Total weight in kilograms.
        address:
          $ref: '#/components/schemas/pickup-address'
          description: Pickup address information.
      required:
        - time_slots
        - quantity
        - total_weight
        - carrier_code
        - address
    pickup-address-state-province-required:
      title: Pickup Address Object
      type: object
      description: Pickup Address object
      allOf:
        - $ref: '#/components/schemas/pickup-address'
        - properties:
            country_code:
              type: string
              example: IT
              description: >-
                Country code of the pickup place according to ISO 3166-1
                alpha-2.
              minLength: 1
            state_province_code:
              type: string
              minLength: 1
              example: IT-RM
              description: State code of the pickup place according to ISO 3166-2.
      required:
        - name
        - address_line_1
        - postal_code
        - city
        - country_code
        - state_province_code
    time-slot-list-end-at-required:
      title: Time Slot List
      type: array
      description: >-
        Scheduled time slots for the pickup. Note that most carriers only
        support a single time slot.
      items:
        type: object
        allOf:
          - $ref: '#/components/schemas/time-slot-end-at-required'
    correos-pickup-item:
      title: Correos Pickup Item Object
      type: object
      description: Information about the items to be picked up.
      allOf:
        - $ref: '#/components/schemas/base-pickup-item'
        - properties:
            volumetric_weight_kind:
              description: The total volumetric weight kind of the parcel
              type: string
              enum:
                - envelope
                - small
                - medium
                - large
                - very_large
                - pallet
      required:
        - quantity
        - container_type
        - total_weight
        - volumetric_weight_kind
    pickup-address-phone-number-required:
      title: Pickup Address Object
      type: object
      description: Pickup Address object
      allOf:
        - $ref: '#/components/schemas/pickup-address'
        - properties:
            phone_number:
              type: string
              description: Phone number of the contact person in the E.164 format.
      required:
        - name
        - address_line_1
        - postal_code
        - city
        - country_code
        - phone_number
    dhl-pickup-item:
      title: DHL Pickup Item Object
      type: object
      description: Provides the information about the items to be picked up.
      allOf:
        - $ref: '#/components/schemas/base-pickup-item'
        - properties:
            container_type:
              type: string
              example: parcel
              description: Type of containers to be picked up.
              enum:
                - parcel
                - pallet
      required:
        - quantity
        - container_type
        - total_weight
    dpd-at-pickup-item:
      title: DPD AT Pickup Item Object
      type: object
      description: Provides the information about the items to be picked up.
      allOf:
        - $ref: '#/components/schemas/base-pickup-item'
        - properties:
            container_type:
              type: string
              example: parcel
              description: Type of containers to be picked up.
              enum:
                - parcel
                - pallet
      required:
        - quantity
        - container_type
        - total_weight
    dhl-de-pickup-item:
      title: DHL DE Pickup Item Object
      type: object
      description: Information about the items to be picked up.
      allOf:
        - $ref: '#/components/schemas/base-pickup-item'
      required:
        - quantity
    fedex-origin-detail:
      title: Fedex Origin Detail Object
      description: >-
        Descriptive data about the origin of the shipment being picked up by
        FedEx.
      type: object
      properties:
        package_location:
          description: >-
            Provides a location description where the courier/driver will pick
            up the package.
          type: string
          enum:
            - front
            - none
            - rear
            - side
        building_part:
          description: Describe package location building part.
          type: string
          enum:
            - apartment
            - building
            - department
            - floor
            - room
            - suite
        building_part_description:
          description: Additional description of package pickup location.
          type: string
        company_close_time:
          description: >-
            Identifies the latest time at which the driver can gain access to
            pick up the package.
          type: string
          format: time
          example: 17:00:00Z
      required:
        - package_location
        - building_part
        - company_close_time
    ups-pickup-address:
      title: UPS Pickup Address Object
      type: object
      description: UPS Pickup Address object
      allOf:
        - $ref: '#/components/schemas/pickup-address'
        - properties:
            phone_number:
              type: string
              description: Phone number of the contact person in the E.164 format.
            floor:
              type:
                - string
                - 'null'
              default: null
              example: '1'
              description: Floor of the pickup place.
            room:
              type:
                - string
                - 'null'
              default: null
              example: 17B
              description: Room of the pickup place.
            is_alternate_address:
              type: boolean
              default: false
              example: true
              description: >-
                Indicates if the pickup address is a different address than that
                specified in a customer's profile.
            is_residential:
              type: boolean
              default: false
              example: true
              description: Indicates if the pickup address is commercial or residential.
      required:
        - name
        - address_line_1
        - postal_code
        - city
        - country_code
    ups-pickup-item:
      title: UPS Pickup Item Object
      type: object
      description: Information about the items to be picked up.
      allOf:
        - $ref: '#/components/schemas/base-pickup-item'
        - properties:
            container_type:
              type: string
              example: parcel
              description: Type of containers to be picked up.
              enum:
                - parcel
                - pallet
            destination_country_code:
              type: string
              example: GB
              minLength: 2
              maxLength: 2
              description: Destination country code.
            shipping_option:
              type: string
              example: express
              description: Shipping option for the pickup.
              enum:
                - standard
                - express
                - express_saver
      required:
        - quantity
        - destination_country_code
        - container_type
        - shipping_option
        - total_weight
    base-pickup-response:
      title: Base Pickup Object
      type: object
      properties:
        id:
          type: integer
          format: int64
          minimum: 1
          description: Unique identifier of the pickup.
        carrier_code:
          type: string
          example: dhl_express
          description: Pickup carrier code selected by the user.
        time_slots:
          $ref: '#/components/schemas/time-slot-list'
          description: Scheduled time slots for the pickup
          minItems: 1
        items:
          type: array
          items:
            $ref: '#/components/schemas/base-pickup-item'
          description: Items scheduled to be picked up.
          minItems: 1
        reference:
          type: string
          description: Reference number for your administration.
          minLength: 0
        special_instructions:
          type: string
          description: Special instructions for the pickup driver.
          minLength: 0
        tracking_number:
          type: string
          minLength: 0
        status:
          type: string
          enum:
            - CREATED
            - CANCELLED
            - FAILED
            - ANNOUNCING
        created_at:
          type: string
          format: date-time
          description: ISO 8601 DateTime at which the pickup is created.
        cancelled_at:
          type:
            - string
            - 'null'
          format: date-time
          description: ISO 8601 DateTime at which the pickup is cancelled.
        contract_id:
          type: integer
          description: Id of the contract that is used to create the pickup.
        address:
          $ref: '#/components/schemas/pickup-address'
          description: Pickup address information.
    time-slot-list:
      title: Time Slot List
      type: array
      description: >-
        Scheduled time slots for the pickup. Note that most carriers only
        support a single time slot.
      items:
        type: object
        allOf:
          - $ref: '#/components/schemas/time-slot'
    ErrorObject:
      title: Error
      type: object
      description: Error in a JSON:API error format
      properties:
        id:
          type: string
          description: A unique identifier for the error.
        links:
          type: object
          description: >-
            A set of hyperlinks that provide additional information about the
            error.
          properties:
            about:
              type: string
              description: A URL that provides additional information about the error.
        status:
          type: string
          format: int32
          description: The HTTP status code of the error.
          minLength: 1
        code:
          type: string
          description: A unique error code for the error, in snake case format.
          minLength: 1
          enum:
            - unknown_field
            - invalid
            - forbidden
            - invalid_choice
            - min_value
            - 'null'
            - not_found
            - required
            - not_a_list
            - non_field_errors
            - authentication_failed
            - validation_error
            - parcel_announcement_error
        title:
          type: string
          description: A short, human-readable summary of the error.
          minLength: 1
        detail:
          type: string
          description: A human-readable explanation of the error.
          minLength: 1
        source:
          type: object
          description: >-
            An object that identifies the source of the error within the request
            payload.
          properties:
            pointer:
              type: string
              description: >-
                A `JSON` pointer to the location of the error within the request
                payload.
            parameter:
              type: string
              description: The name of the `query` parameter that caused the error.
            header:
              type: string
              description: The name of the `header` parameter that caused the error.
        meta:
          type: object
          description: Additional metadata about the error.
    base-pickup-item:
      title: Pickup Item Object
      type: object
      description: Information about the items to be picked up.
      properties:
        quantity:
          type: integer
          minimum: 1
          description: Number of items to pick up.
        container_type:
          type: string
          example: parcel
          description: Type of containers to be picked up.
          enum:
            - parcel
        total_weight:
          $ref: '#/components/schemas/str-weight'
          description: Total weight in kilograms.
      required:
        - quantity
        - container_type
        - total_weight
    str-weight:
      title: Weight
      type: object
      description: Weight in the specified unit
      properties:
        value:
          type: string
          description: Weight value
          example: '14.5'
        unit:
          $ref: '#/components/schemas/weight-units'
      required:
        - value
        - unit
    pickup-address:
      title: Pickup Address Object
      type: object
      description: Pickup Address object
      allOf:
        - $ref: '#/components/schemas/address'
        - properties:
            po_box:
              type:
                - string
                - 'null'
              description: Code required in case of PO Box or post locker delivery
              readOnly: true
      required:
        - name
        - address_line_1
        - postal_code
        - city
        - country_code
    time-slot-end-at-required:
      title: Time Slot Object
      type: object
      properties:
        start_at:
          type: string
          format: date-time
          description: Scheduled pickup time in ISO 8601 DateTime format.
        end_at:
          type: string
          format: date-time
          description: >-
            ISO 8601 DateTime of the pickup location close time. This could be
            useful in case the pickup is delayed.
    time-slot:
      title: Time Slot Object
      type: object
      properties:
        start_at:
          type: string
          format: date-time
          description: Scheduled pickup time in ISO 8601 DateTime format.
        end_at:
          type:
            - string
            - 'null'
          format: date-time
          description: >-
            ISO 8601 DateTime of the pickup location close time. This could be
            useful in case the pickup is delayed.
    weight-units:
      type: string
      title: Mass Units Object
      enum:
        - kg
        - g
        - lbs
        - oz
      example: g
    address:
      title: Address Object
      type: object
      description: Sendcloud Address object
      properties:
        name:
          type: string
          example: John Doe
          description: Name of the person associated with the address
          minLength: 1
        company_name:
          type: string
          example: Sendcloud
          description: Name of the company associated with the address
        address_line_1:
          type: string
          example: Stadhuisplein
          description: First line of the address
        house_number:
          type: string
          example: '50'
          description: House number of the address
        address_line_2:
          type: string
          description: Additional address information, e.g. 2nd level
          example: Apartment 17B
        postal_code:
          type: string
          example: 1013 AB
          description: Zip code of the address
          minLength: 1
        city:
          type: string
          example: Eindhoven
          description: City of the address
          minLength: 1
        po_box:
          type:
            - string
            - 'null'
          description: Code required in case of PO Box or post locker delivery
        state_province_code:
          type: string
          example: IT-RM
          description: >-
            The character state code of the customer represented as ISO 3166-2
            code
        country_code:
          type: string
          example: NL
          description: The country code of the customer represented as ISO 3166-1 alpha-2
          minLength: 1
        email:
          type: string
          format: email
          example: johndoe@gmail.com
          description: Email address of the person associated with the address
        phone_number:
          type: string
          example: '+319881729999'
          description: Phone number of the person associated with the address
  securitySchemes:
    HTTPBasicAuth:
      type: http
      description: >-
        Basic Authentication using API key and secrets is currently the main
        authentication mechanism.
      scheme: basic
    OAuth2ClientCreds:
      type: oauth2
      description: >-
        OAuth2 is a standardized protocol for authorization that allows users to
        share their private resources stored on one site with another site
        without having to provide their credentials. OAuth2 Client Credentials
        Grant workflow. This workflow is typically used for server-to-server
        interactions that require authorization to access specific resources.
      flows:
        clientCredentials:
          tokenUrl: https://account.sendcloud.com/oauth2/token/
          scopes:
            api: Default OAuth scope required to access Sendcloud API.

````

Built with [Mintlify](https://mintlify.com).