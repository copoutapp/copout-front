//

import React, { createRef } from "react";
import {
  Map as LeafletMap,
  Marker,
  TileLayer,
  LayerGroup,
  LayersControl,
  FeatureGroup,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import hash from "object-hash";
import {
  Button,
  Image,
  Modal,
  Form,
  Toast,
  ToastHeader,
  DropdownButton,
  Dropdown,
  Alert,
  ListGroup,
} from "react-bootstrap";
import Cookies from "universal-cookie";
import packageJson from "../package.json";
import "./App.css";

class EventIcons {
  static allEventTypes = [
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
    "Unknown",
  ];

  static getIcon(eventType) {
    let icons = {};
    EventIcons.allEventTypes.forEach(function (element, index) {
      icons[element] = new L.Icon({
        iconUrl: `/Icons/${element}.png`,
        iconSize: [36, 36],
      });
    });

    if (eventType in icons) {
      return icons[eventType];
    } else {
      return icons["Unknown"];
    }
  }
  static getImage(eventType) {
    let images = {};
    EventIcons.allEventTypes.forEach(function (element, index) {
      images[element] = `/Icons/${element}.png`;
    });

    if (eventType in images) {
      return images[eventType];
    } else {
      return images["Unknown"];
    }
  }
}

class City {
  constructor(name, center) {
    this.name = name;
    this.center = center;
  }
}

class Cities {
  static allCitiesArray = [
    new City("Chicago", [41.881735, -87.630648]),
    new City("Minneapolis", [44.980243, -93.264739]),
    new City("Portland", [45.5186167, -122.6872967]),
    new City("Seattle", [47.6054116, -122.3348554]),
    new City("Toronto", [43.6447352, -79.3952525]),
  ];

  static allCitiesDict() {
    let result = {};
    this.allCitiesArray.forEach((value, key) => {
      result[value.name] = value;
    });
    return result;
  }

  // defaults to Toronto if doesn't exist
  static getCityCenter(cityName) {
    if (cityName in this.allCitiesDict()) {
      return this.allCitiesDict()[cityName].center;
    } else {
      return this.allCitiesDict()["Toronto"].center;
    }
  }
}

class App extends React.Component {
  constructor(props) {
    super(props);

    this.cookies = new Cookies();

    this.debug = false;
    this.secureCookie = true;
    this.currentCity = this.cookies.get("currentCity");

    this.state = {
      // Defaults to Toronto
      currentLatLng: this.currentCity
        ? Cities.getCityCenter(this.currentCity)
        : Cities.getCityCenter("Toronto"),
      zoom: 13,
      loaded: false,
      data: null,
      myEvents: [],
      geojson: null,
      currentCity: this.currentCity || "",
      showLocationSelectModal: this.currentCity ? false : true,
      showAboutModal: false,
      showHelpModal: false,
      showLoginModal: false,
      showSignupSuccess: false,
      showLoginSuccess: false,
      showLoginFailure: false,
      loginToken: "",
      validatedToken: this.cookies.get("validatedToken") || "",
      allowEdit: this.cookies.get("allowEdit") === "true" || false,
      showDeleteModal: false,
      deleteEventTarget: "",
      showReportModal: false,
      reportEventTarget: "",
      reportEventMessage: "",
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
      streamEndpoint: this.debug
        ? "http://127.0.0.1:8000"
        : "https://api.copout.app",
      //
      eventSource: null,
    };

    this.mapRef = createRef();
  }

  componentDidMount() {
    this.reloadData(this.state.currentCity);
  }

  // handles saving map center change to state
  onMoveEnd = (event) => {
    this.setState({
      currentLatLng: event.target.getCenter(),
    });
  };

  // handles saving zoom change to state
  onZoomEnd = (event) => {
    this.setState({
      zoom: event.target.getZoom(),
    });
  };

  // fully reloads all data from server
  reloadData(city) {
    this.updateDataSource(city);
    this.updateEventSource(city);
    this.updateMyEventList(city);
  }

  // loads a fresh copy of all event data from server
  updateDataSource(city) {
    // GET mock request using fetch with async/await
    const requestOptions = {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };
    fetch(
      `${this.state.apiEndpint}/api/v0/event/recent/${city}`,
      requestOptions
    )
      .then((response) => response.json())
      .then((json) => {
        this.setState({ data: json, loaded: true });
        console.log("loaded initial data from backend");
      });
  }

  // start a new connection for new event push notifications
  updateEventSource(city) {
    console.log("setting new event source to ", city);
    let eventSource = new EventSource(
      `${this.state.streamEndpoint}/api/v0/new-event-stream/${city}`
    );
    eventSource.onmessage = (e) => this.updateEventList(JSON.parse(e.data));

    this.setState({
      eventSource: eventSource,
    });
  }

  // helper function that adds new event to state.data
  updateEventList = (event) => {
    this.setState({
      data: [...this.state.data, event],
      latestEvent: event,
      toasts: new Map(this.state.toasts.set(event.uuid, event)),
    });
  };

  // loads a fresh copy of myeventlist, which allows editing of events created by current user
  updateMyEventList(city) {
    if (this.state.validatedToken) {
      const requestOptions = {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Token ${this.state.validatedToken}`,
        },
      };
      fetch(
        `${this.state.apiEndpint}/api/v0/event/myrecent/${city}`,
        requestOptions
      )
        .then((response) => response.json())
        .then((json) => {
          let result = [];
          json.forEach((item) => {
            result.push(item.uuid);
          });
          this.setState({ myEvents: result });
          console.log("loaded my events from backend");
        });
    }
  }

  handleDeleteModalShow = (event) => {
    this.setState({
      showDeleteModal: true,
      deleteEventTarget: event.currentTarget.id,
    });
  };

  handleDeleteModalHide = (event) => {
    this.setState({ showDeleteModal: false, deleteEventTarget: "" });
  };

  // removes an event from state.data
  handleDeleteSubmit = (event) => {
    this.setState({
      data: this.removeEvent(this.state.data, this.state.deleteEventTarget),
      showDeleteModal: false,
      deleteEventTarget: "",
    });
  };

  // the webcall to server to remove event
  removeEvent(rawdata, eventId) {
    const requestOptions = {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Token ${this.state.validatedToken}`,
      },
      body: JSON.stringify({
        visible: false,
      }),
    };
    fetch(
      `${this.state.apiEndpint}/api/v0/event/edit/${eventId}`,
      requestOptions
    )
      .then((response) => {
        if (!response.ok) {
          throw response;
        }
        return response.json();
      })
      .then((json) => {})
      .catch((response) => console.log(response));
    let cleanedData = [];
    rawdata.forEach((item) => {
      if (item.uuid === eventId) {
      } else {
        cleanedData.push(item);
      }
    });
    return cleanedData;
  }

  // for reporting bad information
  handleReportModalShow = (event) => {
    this.setState({
      showReportModal: true,
      reportEventTarget: event.currentTarget.id,
    });
  };

  handleReportModalHide = (event) => {
    this.setState({ showReportModal: false, reportEventTarget: "" });
  };

  handleReportEventMessageChange = (event) => {
    this.setState({ reportEventMessage: event.target.value });
  };

  handleReportSubmit = (event) => {
    const requestOptions = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Token ${this.state.validatedToken}`,
      },
      body: JSON.stringify({
        event: this.state.reportEventTarget,
        message: this.state.reportEventMessage,
      }),
    };

    // TBD this is a proxy, need to fix this
    fetch(`${this.state.apiEndpint}/api/v0/event/report`, requestOptions)
      .then((response) => {
        if (!response.ok) {
          throw response;
        }
        return response.json();
      })
      .then((json) => {
        this.setState({
          showReportModal: false,
          reportEventTarget: "",
          reportEventMessage: "",
        });
      })
      .catch((response) => console.log(response));
    // TBD handle error here
    event.preventDefault();
  };

  // removes all temp events that are older than 2 hours
  // TBD: this should set state with new data
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
    });
    return cleanedData;
  }

  sortEventData(rawdata) {
    let result = {};
    rawdata.forEach((item) => {
      if (item.event_type in result) {
        result[item.event_type].push(item);
      } else {
        result[item.event_type] = [item];
      }
    });
    return result;
  }

  // renders the layergroup for leaflet
  constructLayerGroup(rawdata) {
    const { Overlay } = LayersControl;
    let layerGroup = [];
    if (this.state.loaded) {
      let newdata = this.removeOldEvents(rawdata);
      let data = this.sortEventData(newdata);
      for (let key in data) {
        let events = [];
        let eventArray = data[key];
        eventArray.forEach((feature) => {
          let dateString = "";
          if (feature.temp) {
            let date = new Date(Date.parse(feature.event_time));
            let localDate = date.toLocaleString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            });
            dateString = ` <${localDate}>`;
          }
          let deleteButton = "";
          if (this.state.myEvents.includes(feature.uuid)) {
            deleteButton = (
              <Button
                id={feature.uuid}
                bsPrefix="delete"
                onClick={this.handleDeleteModalShow}
              >
                <span role="img" aria-label="delete">
                  🗑️
                </span>
              </Button>
            );
          }
          let reportButton = "";
          if (this.state.validatedToken && deleteButton === "") {
            reportButton = (
              <Button
                id={feature.uuid}
                bsPrefix="delete"
                onClick={this.handleReportModalShow}
              >
                <span role="img" aria-label="report">
                  🏴
                </span>
              </Button>
            );
          }

          events.push(
            <FeatureGroup>
              <Popup>
                <h5>
                  {feature.title}
                  {dateString}
                </h5>
                <p>{feature.message}</p>
                {deleteButton}
                {reportButton}
              </Popup>
              <Marker
                position={[feature.lat, feature.lng]}
                icon={EventIcons.getIcon(key)}
              />
            </FeatureGroup>
          );
        });
        layerGroup.push(
          <Overlay checked name={key}>
            <LayerGroup>{events}</LayerGroup>
          </Overlay>
        );
      }
    }
    // console.log('generated layer group', rawdata)
    return layerGroup;
  }

  //
  handleLoginModalShow = (event) => {
    this.setState({ showLoginModal: true });
  };

  handleLoginModalHide = (event) => {
    this.setState({ showLoginModal: false });
  };

  handleLoginTokenChange = (event) => {
    this.setState({ loginToken: event.target.value });
  };

  // log in with a token
  handleLoginSubmit = (event) => {
    // check if valid token exist, if yes, do nothing
    if (this.state.validatedToken) {
      console.log("already have a validated token");
      return;
    }
    // check if the token is uuid, if yes, it is one time use token
    // if no, it is an auth token, maybe
    let token = this.state.loginToken;
    let uuid_re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let cookieOptions = { secure: this.secureCookie };
    if (uuid_re.test(token)) {
      const requestOptions = {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uuid: token,
        }),
      };
      // TBD this is a proxy, need to fix this
      fetch(`${this.state.apiEndpint}/api/v0/signup`, requestOptions)
        .then((response) => {
          if (!response.ok) {
            throw response;
          }
          return response.json();
        })
        .then((json) => {
          this.cookies.set("validatedToken", json.user, cookieOptions);
          this.setState({
            showSignupSuccess: true,
            validatedToken: json.user,
            loginToken: json.user,
          });
          console.log("Got a valid token", this.state.validatedToken);
        })
        .catch((response) => {
          this.setState({
            showLoginFailure: true,
          });
          // TBD handle error
          console.log(response);
        });
    } else {
      const requestOptions = {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
      };
      // This is a bit hacky
      fetch(`${this.state.apiEndpint}/api/v0/event/new`, requestOptions)
        .then((response) => {
          if (!response.ok) {
            throw response;
          }
          return response.json();
        })
        .then((json) => {
          this.cookies.set("validatedToken", token, cookieOptions);
          this.setState({
            showLoginSuccess: true,
            validatedToken: token,
            showLoginModal: false,
          });
          console.log("Validated existing token", this.state.validatedToken);
        })
        .catch((response) => {
          this.setState({
            showLoginFailure: true,
          });
          // TBD handle error
          console.log(response);
        });
    }
    event.preventDefault();
    // this.setState({ showLoginModal: false });
  };

  // change menu item between login and edit
  constructLoginOrEdit() {
    let result = "";
    if (!this.state.validatedToken) {
      result = (
        <Dropdown.Item eventKey="4" onSelect={this.handleLoginModalShow}>
          Login
        </Dropdown.Item>
      );
    } else {
      result = (
        <Dropdown.Item eventKey="5" onSelect={this.handleEditToggle}>
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
      );
    }
    return result;
  }

  handleAboutModalShow = (event) => {
    this.setState({ showAboutModal: true });
  };

  handleAboutModalHide = (event) => {
    this.setState({ showAboutModal: false });
  };

  handleHelpModalShow = (event) => {
    this.setState({ showHelpModal: true });
  };

  handleHelpModalHide = (event) => {
    this.setState({ showHelpModal: false });
  };

  //
  constructNewEventOptions() {
    let options = [];
    EventIcons.allEventTypes.forEach(function (element, index) {
      options.push(<option>{element}</option>);
    });
    return options;
  }

  // Handle click to create new event
  handleMapClick = (event) => {
    // can use onContextmenu (mobile long click) instead of onClick
    const map = this.mapRef.current;
    if (map != null) {
      if (this.state.allowEdit) {
        // console.log(event);
        this.setState({
          newEventLatLng: event.latlng,
          showNewEventModal: true,
          showNewEventMarker: true,
        });
      }
    }
  };

  handleNewEventModalHide = (event) => {
    this.setState({ showNewEventModal: false, showNewEventMarker: false });
  };

  handleNewEventTypeChange = (event) => {
    this.setState({ newEventType: event.target.value });
  };

  handleNewEventTitleChange = (event) => {
    this.setState({ newEventTitle: event.target.value });
  };

  handleNewEventMessageChange = (event) => {
    this.setState({ newEventMessage: event.target.value });
  };

  // webcall for new event
  handleNewEventSubmit = (event) => {
    const requestOptions = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Token ${this.state.validatedToken}`,
      },
      body: JSON.stringify({
        title: this.state.newEventTitle,
        event_type: this.state.newEventType,
        message: this.state.newEventMessage,
        lat: this.state.newEventLatLng.lat,
        lng: this.state.newEventLatLng.lng,
        city: this.state.currentCity,
      }),
    };
    // TBD this is a proxy, need to fix this
    fetch(`${this.state.apiEndpint}/api/v0/event/new`, requestOptions)
      .then((response) => {
        if (!response.ok) {
          throw response;
        }
        return response.json();
      })
      .then((json) => {
        this.setState({
          showNewEventModal: false,
          showNewEventMarker: false,
          newEventLatLng: null,
          newEventTitle: "",
          newEventMessage: "",
          newEventType: "Unknown",
          myEvents: [...this.state.myEvents, json.uuid],
        });
      })
      .catch((response) => console.log(response));
    // TBD handle error here
    event.preventDefault();
  };

  // Toast notifications
  constructToastGroup() {
    // only show three latest events, bit hacky
    let toastsArray = Array.from(this.state.toasts).reverse().slice(0, 3);
    let toasts = new Map(toastsArray);
    let results = [];
    toasts.forEach((value, key) => {
      let toast = (
        <Toast
          id={key}
          show="true"
          onClose={this.handleRemoveToast}
          onClick={this.handleToastOnClick}
        >
          <ToastHeader id={key}>
            <img
              src={EventIcons.getImage(value.event_type)}
              width="24"
              height="24"
              className="rounded mr-2"
              id={key}
              alt=""
            />
            <strong className="mr-auto" id={key}>
              {value.title}
            </strong>
          </ToastHeader>
          <Toast.Body id={key}>{value.message}</Toast.Body>
        </Toast>
      );
      results.push(toast);
    });
    return results;
  }

  // change map center to toast event location on click
  handleToastOnClick = (event) => {
    let toasts = this.state.toasts;
    let toast = toasts.get(event.target.id);
    if (toast) {
      this.setState({
        currentLatLng: [toast.lat, toast.lng],
        zoom: this.mapRef.current.leafletElement.getZoom(),
      });
    }
  };

  handleRemoveToast = (event) => {
    let toasts = this.state.toasts;
    // very hacky lol
    toasts.delete(event.currentTarget.parentNode.parentNode.getAttribute("id"));
    this.setState({ toasts: new Map(toasts) });
  };

  handleEditToggle = (event) => {
    let allowEdit = this.state.allowEdit;
    this.cookies.set("allowEdit", !allowEdit);
    this.setState({ allowEdit: !allowEdit });
    console.log("cookie set to", this.cookies.get("allowEdit"));
  };

  handleLocationSelectShow = (event) => {
    this.setState({ showLocationSelectModal: true });
  };

  handleLocationSelectHide = (event) => {
    this.setState({ showLocationSelectModal: false });
  };

  handleLocationSelectChanged = (event) => {
    this.cookies.set("currentCity", event.target.id);
    this.setState({
      currentLatLng: Cities.getCityCenter(event.target.id),
      currentCity: event.target.id,
      showLocationSelectModal: false,
    });
    this.reloadData(event.target.id);
    //
  };

  constructCitiesListGroup() {
    let cities = Cities.allCitiesArray;
    let results = [];
    cities.forEach((value, key) => {
      let item = (
        <ListGroup.Item
          action
          onClick={this.handleLocationSelectChanged}
          eventKey={value.name}
          id={value.name}
        >
          {value.name}
        </ListGroup.Item>
      );
      results.push(item);
    });
    return results;
  }

  render() {
    // Marker for new event
    let marker;
    if (this.state.showNewEventMarker) {
      marker = (
        <Marker
          position={this.state.newEventLatLng}
          icon={EventIcons.getIcon(this.state.newEventType)}
        ></Marker>
      );
    } else {
      marker = null;
    }

    return (
      <>
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 1000,
          }}
        >
          {this.constructToastGroup()}
        </div>

        <div
          style={{
            position: "absolute",
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
            <Dropdown.Item eventKey="1" onSelect={this.handleAboutModalShow}>
              About (v{packageJson.version})
            </Dropdown.Item>
            <Dropdown.Item eventKey="2" onSelect={this.handleHelpModalShow}>
              Help
            </Dropdown.Item>
            <Dropdown.Item
              eventKey="3"
              onSelect={this.handleLocationSelectShow}
            >
              Change Location
            </Dropdown.Item>
            {this.constructLoginOrEdit()}
          </DropdownButton>
        </div>

        <LeafletMap
          center={this.state.currentLatLng}
          zoom={this.state.zoom}
          zoomControl={false}
          onClick={this.handleMapClick}
          ref={this.mapRef}
          key={hash(this.state.data)}
          onMoveEnd={this.onMoveEnd}
          onZoomEnd={this.onZoomEnd}
        >
          <LayersControl position="topleft">
            <TileLayer
              attribution='&amp;copy <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/#/-74.5/40/10">Improve this map</a>'
              url="https://api.mapbox.com/styles/v1/bigboyonthestreeet/ckbshbiqx0v3x1inyld1izkp5/tiles/256/{z}/{x}/{y}@2x?access_token=pk.eyJ1IjoiYmlnYm95b250aGVzdHJlZWV0IiwiYSI6ImNrYXkzanI4MzBlZDQzMm9hc2dqeGR3dWkifQ.HKcbnYgCvUovWvKfBKElhA"
            />
            {this.constructLayerGroup(this.state.data)}
          </LayersControl>
          {marker}
        </LeafletMap>

        <Modal
          show={this.state.showLoginModal}
          onHide={this.handleLoginModalHide}
          size="lg"
          dialogClassName="modal-bottom"
        >
          <Modal.Header closeButton>
            <Modal.Title>Login (Enable Edit)</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={this.handleLoginSubmit}>
              <Alert
                show={this.state.showSignupSuccess}
                key="login-success"
                variant="success"
              >
                Login succeeded. Please save your NEW personal token to a safe
                place.
              </Alert>
              <Alert
                show={this.state.showLoginFailure}
                key="login-failure"
                variant="danger"
              >
                Login failed. Invalid token.
              </Alert>
              <Form.Group controlId="formToken">
                <Form.Label>Token</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Token"
                  value={this.state.loginToken}
                  onChange={this.handleLoginTokenChange}
                />
              </Form.Group>
              <Button variant="primary" type="submit">
                Submit
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        <Modal
          show={this.state.showNewEventModal}
          onHide={this.handleNewEventModalHide}
          size="lg"
          dialogClassName="modal-bottom"
        >
          <Modal.Header closeButton>
            <Modal.Title>Submit a new event</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={this.handleNewEventSubmit}>
              <Form.Group controlId="formType">
                <Form.Label>Event Type</Form.Label>
                <Form.Control
                  as="select"
                  value={this.state.newEventType}
                  onChange={this.handleNewEventTypeChange}
                >
                  {this.constructNewEventOptions()}
                </Form.Control>
              </Form.Group>
              <Form.Group controlId="formTitle">
                <Form.Label>Event Title</Form.Label>
                <Form.Control
                  required
                  type="text"
                  placeholder="Title"
                  value={this.state.newEventTitle}
                  onChange={this.handleNewEventTitleChange}
                />
              </Form.Group>
              <Form.Group controlId="formMessage">
                <Form.Label>Message</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Message"
                  value={this.state.newEventMessage}
                  onChange={this.handleNewEventMessageChange}
                />
              </Form.Group>
              <Button variant="primary" type="submit">
                Submit
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        <Modal
          show={this.state.showAboutModal}
          onHide={this.handleAboutModalHide}
          size="lg"
          centered
        >
          <Modal.Header closeButton id="AboutHead">
            <Modal.Title>About This App</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              This application provides a mapping service that can be updated
              on-the-fly according to events in the midst of a protest. The
              resurgence of the Black Lives Matter movement right now in 2020
              has proven that activism is necessary to challenge the racist
              status quo. The form of this app was inspired by the HK Live Map
              application. This project is open-source and is available at its
              <a href="https://github.com/copoutapp/copout-front"> Github </a>
              page.
            </p>
          </Modal.Body>

          <Modal.Header>
            <Modal.Title id="AboutHead">Privacy</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              We take your privacy and anonymity seriously. We use cookies, but
              we do not do any cross site-tracking or analytics. We don't store
              or transmit any PII (Personally Identifiable Information), or any
              other sensitive information.
            </p>
          </Modal.Body>
        </Modal>

        <Modal
          show={this.state.showHelpModal}
          onHide={this.handleHelpModalHide}
          size="lg"
          centered
        >
          <Modal.Header closeButton id="AboutHead">
            <Modal.Title>Tutorial</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              This app allows you to pinpoint active events during a protest on
              a live map. In order to place events login with an authorized
              token. Toggle the editing on and tap to add events. Pick a
              relevant type and message and the event will be visible to you and
              other users. If you've lost a token, or need other assistance use
              the contact options below.
            </p>
          </Modal.Body>

          <Modal.Header>
            <Modal.Title id="AboutHead">Contact</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              Email:{" "}
              <a href="mailto:copoutapp@gmail.com">copoutapp@gmail.com</a>{" "}
            </p>
            <p>
              Twitter: <a href="https://twitter.com/GetCopOut">@GetCopOut</a>
            </p>
            <p>
              Facebook:{" "}
              <a href="https://www.facebook.com/CopOutApp/">@CopOutApp</a>
            </p>
          </Modal.Body>
        </Modal>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 10,
            zIndex: 1000,
          }}
        >
          <div>
            <Image className="logo-btm" src="logo.png" fluid rounded />
          </div>

          <Image src="mapbox_logo.png" />
        </div>

        <Modal
          show={this.state.showLocationSelectModal}
          onHide={this.handleLocationSelectHide}
          size="lg"
          backdrop="static"
          keyboard={false}
          centered
          dialogClassName="modal-splash"
        >
          <div id="headline">
            <Image className="headline-img" src="headline.png" fluid rounded />
          </div>
          <Modal.Header>
            <Modal.Title>Select your location</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <ListGroup>{this.constructCitiesListGroup()}</ListGroup>
          </Modal.Body>
        </Modal>

        <Modal
          show={this.state.showDeleteModal}
          onHide={this.handleDeleteModalHide}
          size="lg"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Delete this?</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Button
              variant="primary"
              type="submit"
              onClick={this.handleDeleteSubmit}
            >
              Delete
            </Button>
          </Modal.Body>
        </Modal>

        <Modal
          show={this.state.showReportModal}
          onHide={this.handleReportModalHide}
          size="lg"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Report this for bad info</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={this.handleReportSubmit}>
              <Form.Group controlId="reportMessage">
                <Form.Control
                  type="text"
                  placeholder="Details please"
                  value={this.state.reportEventMessage}
                  onChange={this.handleReportEventMessageChange}
                />
              </Form.Group>
              <Button variant="primary" type="submit">
                Report
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
      </>
    );
  }
}

export default App;
