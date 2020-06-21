//

import React, { createRef } from 'react'
import { Map as LeafletMap, Marker, TileLayer, LayerGroup, LayersControl, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import hash from 'object-hash';
import { Button, Modal, Form, Toast, ToastHeader, DropdownButton, Dropdown, Alert } from 'react-bootstrap'
import Cookies from 'universal-cookie';
import packageJson from '../package.json';
import './App.css';

class EventIcons {
  static allEventTypes() {
    let result = [
      "Police",
      "PoliceCar",
      "RubberBullets",
      "TearGas",
      "Roadblock",
      "Danger",
      "Safehouse",
      "Paramedic",
      "Protester",
      "Reporter",
      "Fire",
      "GoUp",
      "GoDown",
      "GoLeft",
      "GoRight",
      "PoliceStation",
      "Hospital",
      "Unknown"
    ];
    return result
  }
  static getIcon(eventType) {
    let icons = {};
    EventIcons.allEventTypes().forEach(function (element, index) {
        icons[element] = new L.Icon({iconUrl: `/Icons/${element}.png`, iconSize: [36, 36]});
      }
    )

    if (eventType in icons) {
      return icons[eventType]
    } else {
      return icons["Unknown"]
    }
  }
  static getImage(eventType) {
    let images = {};
    EventIcons.allEventTypes().forEach(function (element, index) {
      images[element] = `/Icons/${element}.png`;
      }
    )

    if (eventType in images) {
      return images[eventType]
    } else {
      return images["Unknown"]
    }
  }
}

class App extends React.Component {
  constructor(props) {
      super(props);

      this.cookies = new Cookies();

      this.debug =  false;
      this.secureCookie = true;

      this.state = {
        // this is for toronto
        lat: 43.6447352,
        lng: -79.3952525,
        outerBounds: [[43.180978, -79.955601], [44.002954, -78.845571]],
        // end toronto
        zoom: 13,
        loaded: false,
        data: null,
        geojson: null,
        showLoginModal: false,
        showSignupSuccess: false,
        showLoginSuccess: false,
        showLoginFailure: false,
        loginToken: "",
        validatedToken: this.cookies.get('validatedToken') || "",
        allowEdit: (this.cookies.get('allowEdit') == 'true') || false,
        showNewEventModal: false,
        showNewEventMarker: false,
        newEventLatLng: null,
        // newEventTime: null,
        newEventTitle: "",
        newEventMessage: "",
        newEventType: "Unknown",
        showNotification: true,
        latestEvent: null,
        toasts: new Map(),
        //
        apiEndpint: this.debug ? "" : "https://api.copout.app",
        streamEndpoint: this.debug ? "http://127.0.0.1:8000" : "https://api.copout.app"
      };

      this.mapRef = createRef();
      // this.eventSource = new EventSource('/api/v0/new-event-stream');
      this.eventSource = new EventSource(`${this.state.streamEndpoint}/api/v0/new-event-stream`);
    }

  async componentDidMount() {
    // loads some local settings
    // GET mock request using fetch with async/await
    const requestOptions = {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };
    const response = await fetch(`${this.state.apiEndpint}/api/v0/event/recent`, requestOptions);
    const data = await response.json();
    this.setState({ data: data, loaded: true });
    console.log('loaded initial data from backend');
    this.eventSource.onmessage = e => this.updateEventList(JSON.parse(e.data));
  }

  updateEventList = (event) => {
    this.setState({
      data: [...this.state.data, event],
      latestEvent: event,
      toasts: new Map(this.state.toasts.set(event.uuid, event))
    })
    // console.log(this.state.latestEvent)
  }

  // Popup on marker with information of the event
  onEachFeature(feature, layer) {
    let dateString = "";
    if (feature.properties.temp) {
      let date = new Date(Date.parse(feature.properties.time));
      let localDate = date.toLocaleString('us', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      dateString = ` <${localDate}>`
    }
    const popupContent = `<Popup><h5>${feature.properties.title}${dateString}</h5><p>${feature.properties.message}</p></pre></Popup>`
    layer.bindPopup(popupContent)
  }
  
  // Icon for marker
  pointToLayer(feature, latlng) {
    return L.marker(latlng, {icon: EventIcons.getIcon(feature.properties.type)}); 
  }
  
  // removes all temp events that are older than 2 hours
  removeOldEvents(rawdata) {
    let cleanedData = [];
    let currentTime = Date.now();
    rawdata.forEach((item) => {
      if (item.temp) { 
        let time = Date.parse(item.event_time);
        if (currentTime - time <= 7200000) {
          cleanedData.push(item);
        }
      } else {
        cleanedData.push(item);
      }
    })
    return cleanedData
  }

  // Construct GeoJson from raw data
  convertDataToGeoJson(rawdata) {
    // construct a GeoJSON
    let cleanedgeojson = {};
    rawdata.forEach((item) => {
      let newFeature = {
        "type": "Feature",
        "properties": {
            "uuid": item.uuid,
            "user": null,
            "title": item.title,
            "message": item.message,
            "type": item.event_type,
            "time": item.event_time,
            "temp": item.temp
        },
        "geometry": {
            "type": "Point",
            "coordinates": [
                item.lng,
                item.lat
            ]
        }
      };
      if (item.event_type in cleanedgeojson) {
        cleanedgeojson[item.event_type].features.push(newFeature);
      } else {
        cleanedgeojson[item.event_type] = {
          "type": "FeatureCollection",
          "name": item.event_type,
          "crs": {
              "type": "name",
              "properties": {
                  "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
              }
          },
          "features": [
            newFeature
          ]
        }
      }
    });
    return cleanedgeojson;
  }

  // Render the markers from GeoJSON
  constructLayerGroup(rawdata) {
    const { BaseLayer, Overlay } = LayersControl;
    let layerGroup = [];
    if (this.state.loaded) {
      let newdata = this.removeOldEvents(rawdata);
      let data = this.convertDataToGeoJson(newdata);
      // console.log(data)
      for (var key in data) {
        layerGroup.push(<Overlay checked name={key}>
          <LayerGroup>
            <GeoJSON
              key={hash(this.state.latestEvent)}
              pointToLayer={this.pointToLayer}
              data={data[key]}
              onEachFeature={this.onEachFeature}
            />
          </LayerGroup>
        </Overlay>)
      }
    }
    // console.log('generated layer group', rawdata)
    return layerGroup;
  }

  //
  handleLoginModalShow = (event) => {
    this.setState({ showLoginModal: true });
  }

  handleLoginModalHide = (event) => {
    this.setState({ showLoginModal: false });
  }

  handleLoginTokenChange = (event) => {
    this.setState({ loginToken: event.target.value })
  }

  handleLoginSubmit = (event) => {
    // check if valid token exist, if yes, do nothing
    if (this.state.validatedToken) {
      console.log('already have a validated token')
      return
    }
    // check if the token is uuid, if yes, it is one time use token
    // if no, it is an auth token, maybe
    let token = this.state.loginToken;
    let uuid_re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    let cookieOptions = { secure: this.secureCookie }
    if (uuid_re.test(token)) {
      const requestOptions = {
        method: 'PUT',
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uuid: token,
        })
      };
      // TBD this is a proxy, need to fix this
      fetch(`${this.state.apiEndpint}/api/v0/signup`, requestOptions)
        .then(response => {
          if (!response.ok) { throw response }
          return response.json()
        })
        .then(json => {
          this.cookies.set('validatedToken', json.user, cookieOptions)
          this.setState({ 
            showSignupSuccess: true,
            validatedToken: json.user,
            loginToken: json.user,
          })
          console.log('Got a valid token', this.state.validatedToken)
        })
        .catch(response => {
          this.setState({
            showLoginFailure: true,
          })
          // TBD handle error
          console.log(response)
        });
    } else {
      const requestOptions = {
        method: 'GET',
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        }
      };
      // This is a bit hacky
      fetch(`${this.state.apiEndpint}/api/v0/event/new`, requestOptions)
        .then(response => {
          if (!response.ok) { throw response }
          return response.json()
        })
        .then(json => {
          this.cookies.set('validatedToken', token, cookieOptions)
          this.setState({ 
            showLoginSuccess: true,
            validatedToken: token,
            showLoginModal: false,
          });
          console.log('Validated existing token', this.state.validatedToken)
        })
        .catch(response => {
          this.setState({
            showLoginFailure: true,
          })
          // TBD handle error
          console.log(response)
        });
    }
    event.preventDefault();
    // this.setState({ showLoginModal: false });
  }

  //
  constructLoginOrEdit() {
    let result = "";
    if (!this.state.validatedToken) {
      result = (<Dropdown.Item eventKey="3" onSelect={this.handleLoginModalShow}>Login</Dropdown.Item>)
    } else {
      result = (
        <Dropdown.Item eventKey="4" onSelect={this.handleEditToggle}>
          <Form>
            <Form.Check 
              type="switch"
              id="edit-switch"
              label="Edit"
              checked={this.state.allowEdit ? true : false}
              onChange={this.handleLoginModalShow}
            />
          </Form>
        </Dropdown.Item>
      )
    }
    return result;
  }

  //
  constructNewEventOptions() {
    let options = [];
    EventIcons.allEventTypes().forEach(function (element, index) {
      options.push(<option>{element}</option>);
      }
    )
    return options;
  }

  // Handle click to create new event
  handleMapClick = (event) => {
    // can use onContextmenu (mobile long click) instead of onClick
    const map = this.mapRef.current
    if (map != null) {
      if (this.state.allowEdit) {
        // console.log(event);
        this.setState({ newEventLatLng: event.latlng, showNewEventModal: true, showNewEventMarker: true })
      }
    }
  }

  handleNewEventModalHide = (event) => {
    this.setState({ showNewEventModal: false, showNewEventMarker: false });
  }

  handleNewEventTypeChange = (event) => {
    this.setState({ newEventType: event.target.value })
  }

  handleNewEventTitleChange = (event) => {
    this.setState({ newEventTitle: event.target.value })
  }

  handleNewEventMessageChange = (event) => {
    this.setState({ newEventMessage: event.target.value })
  }

  handleNewEventSubmit = (event) => {
    const requestOptions = {
      method: 'POST',
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.state.validatedToken}`
      },
      body: JSON.stringify({
        title: this.state.newEventTitle,
        event_type: this.state.newEventType,
        message: this.state.newEventMessage,
        lat: this.state.newEventLatLng.lat,
        lng: this.state.newEventLatLng.lng,
      })
    };
    // TBD this is a proxy, need to fix this
    fetch(`${this.state.apiEndpint}/api/v0/event/new`, requestOptions)
      .then(response => {
        if (!response.ok) { throw response }
        return response.json()
      })
      .then(json => {
        this.setState({ 
          showNewEventModal: false,
          showNewEventMarker: false,
          newEventLatLng: null,
          newEventTitle: "",
          newEventMessage: "",
          newEventType: "Unknown",
        })
      })
      .catch(response => console.log(response));
    // TBD handle error here
    event.preventDefault();
  }

  // Toast notifications
  constructToastGroup() {
    // only show three latest events, bit hacky
    let toastsArray = Array.from(this.state.toasts).reverse().slice(0, 3);
    let toasts = new Map(toastsArray)
    let results = [];
    toasts.forEach((value, key) => {
      let toast = (
        <Toast id={key} show="true" onClose={this.handleRemoveToast} onClick={this.handleToastOnClick}>
          <ToastHeader id={key}>
            <img src={EventIcons.getImage(value.event_type)} width="24" height="24" className="rounded mr-2" id={key} alt="" />
            <strong className="mr-auto" id={key}>{value.title}</strong>
          </ToastHeader>
          <Toast.Body id={key}>{value.message}</Toast.Body>
        </Toast>
      )
      results.push(toast);
    })
    return results;
  }

  handleToastOnClick = (event) => {
    let toasts = this.state.toasts
    let toast = toasts.get(event.target.id)
    if (toast) {
      this.setState({
        lat: toast.lat,
        lng: toast.lng,
        zoom: this.mapRef.current.leafletElement.getZoom()
      })
    }
  }

  handleRemoveToast = (event) => {
    let toasts = this.state.toasts
    // very hacky lol
    toasts.delete(event.currentTarget.parentNode.parentNode.getAttribute("id"))
    this.setState({ toasts: new Map(toasts) })
  }

  handleEditToggle = (event) => {
    let allowEdit = this.state.allowEdit;
    this.cookies.set('allowEdit', !allowEdit)
    this.setState({ allowEdit: !allowEdit })
    console.log('cookie set to', this.cookies.get('allowEdit'))
  }

  render() {
    const position = [this.state.lat, this.state.lng];
    
    // Marker for new event
    let marker;
    if (this.state.showNewEventMarker) {
      marker = <Marker position={this.state.newEventLatLng} icon={EventIcons.getIcon(this.state.newEventType)}></Marker>
    } else {
      marker = null
    }

    return (
      <>
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1000,
          }}
        >
          {this.constructToastGroup()}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 10,
            zIndex: 1000,
          }}
        >
          <DropdownButton
            id={`dropdown-button-drop-up`}
            drop="up"
            variant="primary"
            title="Options"
          >
            <Dropdown.Item eventKey="1">About (v{packageJson.version})</Dropdown.Item>
            <Dropdown.Item eventKey="2">Help</Dropdown.Item>
            {this.constructLoginOrEdit()}
          </DropdownButton>
        </div>

        <LeafletMap center={position} maxBounds={this.state.outerBounds} zoom={this.state.zoom} zoomControl={false} onClick={this.handleMapClick} ref={this.mapRef}>
          <LayersControl position="topleft">
            <TileLayer
              attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {this.constructLayerGroup(this.state.data)}
          </LayersControl>
          {marker}
        </LeafletMap>

        <Modal show={this.state.showLoginModal} onHide={this.handleLoginModalHide} size="lg" dialogClassName="modal-bottom">
          <Modal.Header closeButton>
            <Modal.Title>Login (Enable Edit)</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={this.handleLoginSubmit}>
              <Alert show={this.state.showSignupSuccess} key="login-success" variant="success">
                Login succeeded. Please save your NEW personal token to a safe place.
              </Alert>
              <Alert show={this.state.showLoginFailure} key="login-failure" variant="danger">
                Login failed. Invalid token.
              </Alert>
              <Form.Group controlId="formToken">
                <Form.Label>Token</Form.Label>
                <Form.Control type="text" placeholder="Token" value={this.state.loginToken} onChange={this.handleLoginTokenChange} />
              </Form.Group>
              <Button variant="primary" type="submit">
                Submit
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        <Modal show={this.state.showNewEventModal} onHide={this.handleNewEventModalHide} size="lg" dialogClassName="modal-bottom">
          <Modal.Header closeButton>
            <Modal.Title>Report a new event</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={this.handleNewEventSubmit}>
              <Form.Group controlId="formType">
                <Form.Label>Report Type</Form.Label>
                <Form.Control as="select" value={this.state.newEventType} onChange={this.handleNewEventTypeChange}>
                  {this.constructNewEventOptions()}
                </Form.Control>
              </Form.Group>
              <Form.Group controlId="formTitle">
                <Form.Label>Report Title</Form.Label>
                <Form.Control required type="text" placeholder="Title" value={this.state.newEventTitle} onChange={this.handleNewEventTitleChange} />
              </Form.Group>
              <Form.Group controlId="formMessage">
                <Form.Label>Message</Form.Label>
                <Form.Control type="text" placeholder="Message" value={this.state.newEventMessage} onChange={this.handleNewEventMessageChange} />
              </Form.Group>
              <Button variant="primary" type="submit">
                Submit
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
      </>
    )
  }
}

export default App; 